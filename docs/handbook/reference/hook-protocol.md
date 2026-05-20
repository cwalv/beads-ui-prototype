# Hook protocol

Beads has three distinct hook systems:

1. **Mutation hooks** — `.beads/hooks/{on_create,on_update,on_close}` —
   fire-and-forget scripts wrapped around each write via `HookFiringStore`.
2. **Git hooks** — `.git/hooks/*` — managed by `bd hooks install`; a
   shim block delegates to `bd hooks run <name>`.
3. **`bd prime`** — emits session-start context for AI agent hooks.

## 1. Mutation hooks

### Location

Default: `<workspaceRoot>/.beads/hooks/`. Resolved by
`NewRunnerFromWorkspace` at
`github/gastownhall/beads/internal/hooks/hooks.go:42-45`.

### Files

```
.beads/hooks/on_create   (executable)
.beads/hooks/on_update   (executable)
.beads/hooks/on_close    (executable)
```

Declared constants (`hooks.go:13-25`):

```go
const (
    EventCreate = "create"
    EventUpdate = "update"
    EventClose  = "close"
)
const (
    HookOnCreate = "on_create"
    HookOnUpdate = "on_update"
    HookOnClose  = "on_close"
)
```

If a file doesn't exist, isn't executable (mode `0111`), or is a
directory, the hook silently skips (`hooks.go:57-66`).

### Invocation protocol

A hook is invoked as:

```bash
/path/to/.beads/hooks/on_create <issue-id> <event-type>
```

The full `types.Issue` struct is serialized as JSON on **stdin**.
(Verified against `internal/hooks/hooks_unix.go:54`.) The JSON field set
matches [json-outputs.md `bd list`](json-outputs.md#bd-list---json).

### Timeout

Hard-coded to **10 seconds** (`hooks.go:38`). Exceeding the timeout
kills the whole process group (on Unix, `Setpgid: true` + `syscall.Kill(-pid, SIGKILL)`).

### Output

Hook stdout/stderr is captured and truncated to 1024 bytes
(`hooks.go:115`). The truncated output becomes an OTel span event;
it is NOT shown to the user.

### Async-ness

`Run(event, issue)` is fire-and-forget (`hooks.go:49-72`) — it spawns a
goroutine, returns immediately, and never surfaces errors. Hooks cannot
block or veto the triggering operation.

`RunSync` exists for tests (`hooks.go:76-95`).

### Which operations fire which hook

From `internal/storage/hook_decorator.go:59-167`:

| Operation | Event |
|---|---|
| `CreateIssue`, `CreateIssues` | `on_create` |
| `UpdateIssue`, `ReopenIssue`, `UpdateIssueType` | `on_update` |
| `CloseIssue` | `on_close` |
| `AddDependency`, `RemoveDependency` | `on_update` |
| `AddLabel`, `RemoveLabel` | `on_update` |
| `AddIssueComment` | `on_update` |

**`DeleteIssue` does NOT fire a hook** — the issue no longer exists to
attach the event to. See
[../../gaps-audit.md](../../gaps-audit.md) §A11 for the implications
(cache invalidation can drift on deletes).

### Transactions

Inside `RunInTransaction`, pending hook events accumulate and fire only
after the Dolt commit succeeds (`hook_decorator.go:175-189`). On
rollback, no hooks fire.

### Disabling

- `BD_NO_HOOKS=1` env var — simplest kill-switch.
- `bd config set no-hooks true` — persistent.

When disabled, the store is not wrapped in `HookFiringStore`; all
mutations bypass the hooks entirely.

### Example hook

```bash
#!/bin/bash
# .beads/hooks/on_update
# Receives: $1=issue-id, $2=event-type
# stdin: full Issue JSON

issue_json=$(cat)
issue_id="$1"

status=$(echo "$issue_json" | jq -r '.status')

if [[ "$status" == "closed" ]]; then
    curl -fsS -X POST "https://hooks.example.com/bead-closed" \
        -H "Content-Type: application/json" \
        -d "$issue_json" || true
fi
```

Remember: must exit within 10s, any stdout/stderr is truncated and
ignored.

## 2. Git hooks

### Managed hooks

Five git hooks are managed (`cmd/bd/hooks.go:22, 281`):

- `pre-commit`
- `post-merge`
- `pre-push`
- `post-checkout`
- `prepare-commit-msg`

### Commands

| Command | Purpose |
|---|---|
| `bd hooks install` | Install the shim. Default path `.git/hooks/`. |
| `bd hooks install --beads` | Install to `.beads/hooks/`; set `core.hooksPath`. |
| `bd hooks install --shared` | Install to `.beads-hooks/` (committable). |
| `bd hooks install --force` | Overwrite without preserving user content. |
| `bd hooks install --chain` | Rename existing hooks to `.old` for manual chaining. |
| `bd hooks uninstall` | Remove managed section; preserve user content. |
| `bd hooks list` | Per-hook report: `installed`, `version`, `is_shim`, `outdated`. |
| `bd hooks run <name> [args...]` | Called by the shim; executes the actual hook logic. |

### Section markers

The shim writes a managed block between markers
(`hooks.go:33-44`):

```
# --- BEGIN BEADS INTEGRATION vX.Y.Z ---
...
# --- END BEADS INTEGRATION vX.Y.Z ---
```

Only content inside the markers is managed; user content outside is
preserved on install / reinstall.

### Shim contents

The shim:

1. Sets `BD_GIT_HOOK=1`.
2. Wraps `bd hooks run <name>` in `timeout $BEADS_HOOK_TIMEOUT` (default
   300s).
3. On exit 124 (timeout), translates to 0 so git operations don't block.
4. On exit 3 (database not initialized), translates to 0 so fresh
   clones aren't blocked.

### What each hook does

Implementation in `cmd/bd/hooks.go`:

| Hook | Behavior |
|---|---|
| `pre-commit` | Runs chained user hook; then `exportJSONLForCommit` if `export.auto` is set. |
| `post-merge` | Runs chained user hook; auto-imports `.beads/issues.jsonl` into Dolt when `import.auto` is set (GH#3729). Never blocks merge. |
| `pre-push` | Runs chained user hook; can block push. |
| `post-checkout` | Runs chained user hook; on branch checkout (flag=1), auto-imports `.beads/issues.jsonl` into Dolt when `import.auto` is set. Never blocks. |
| `prepare-commit-msg` | Adds `Executed-By: $BD_ACTOR` trailer. Skips on merge. Never blocks. |

### Disabling / bypassing

- `BEADS_HOOK_TIMEOUT=<seconds>` to change timeout.
- `git commit --no-verify` to bypass all pre-commit hooks (including
  the beads shim).
- Legacy hooks migrated via `bd migrate hooks --apply` (subcommand of `bd migrate`).

## 3. `bd prime` (session-start)

Full details in [prime-contract.md](prime-contract.md). Summary:

- Invoked by an AI-agent session hook on start.
- Reads the local `PRIME.md` override chain or emits the default.
- Injects memories (`bd remember`) automatically.
- Silent fail on error — exit 0 with no output — so a session never
  breaks because of a beads problem.

## Orchestrator patterns

### gascity

Uses the **write-side** mutation hooks as its event bus. The `on_update`
(etc.) scripts installed by `gc init` emit events to the controller,
which invalidates gascity's `CachingStore`. Cache staleness depends on
hooks being intact; a user running `bd` in a workdir without hooks
installed will drift until the next reconciler tick (30s-120s). See
[../../05-gascity-integration.md](../../05-gascity-integration.md) §7.

### gastown

Does NOT use the mutation hooks. Uses Claude Code hooks (SessionStart /
PreToolUse / PostToolUse) installed per agent under `.claude/settings.json`
— these are editor hooks, not beads hooks. See
[../../04-gastown-integration.md](../../04-gastown-integration.md) §7.5.1.

## See also

- [bd-commands.md](bd-commands.md#setup-and-configuration) — the
  command surface for `bd hooks`.
- [prime-contract.md](prime-contract.md) — `bd prime`.
- [../explanation/agent-coordination.md](../explanation/agent-coordination.md)
  — hooks as a coordination primitive.

# Write a lifecycle hook

Mutation hooks fire on bead create / update / close. They're
fire-and-forget scripts in `.beads/hooks/`. Use them for
notifications, cache invalidation, external-system sync.

For the full protocol reference see
[../reference/hook-protocol.md](../reference/hook-protocol.md).

## Files

```
.beads/hooks/on_create   (executable)
.beads/hooks/on_update   (executable)
.beads/hooks/on_close    (executable)
```

If a file doesn't exist or isn't executable (any bit in mode `0111`),
the hook silently skips. No configuration needed beyond placing the
file.

The three mutation events are exactly `on_create`, `on_update`, and
`on_close`. There is no `on_delete` — `bd delete` deliberately skips
firing because the issue no longer exists to pass to the hook (see
`internal/storage/hook_decorator.go:319-323`).

## Invocation

The hook is invoked as:

```bash
/path/to/.beads/hooks/on_update <issue-id> <event-type>
```

where `<event-type>` is one of `create`, `update`, `close` (note: no
`on_` prefix on the argument — that's only in the file name), with
the full `types.Issue` struct serialized as JSON on **stdin**.

## Constraints

- **10 second hard timeout** (`internal/hooks/hooks.go:38`). Exceeding
  it kills the whole process group via `SIGKILL` on the negative PID,
  so child processes die too.
- **Stdout/stderr truncated to 1024 bytes** (`hooks.go:115`). The
  captured output is attached to OTel spans; it's not shown to the
  user.
- **Fire-and-forget.** Your hook cannot block or veto the triggering
  operation. Ever.
- **Don't assume user context.** Hooks may run as any user who wrote
  to the DB.

## Example: Slack webhook on close

`.beads/hooks/on_close`:

```bash
#!/bin/bash
set -e

issue_json=$(cat)
title=$(echo "$issue_json" | jq -r .title)
id=$(echo "$issue_json" | jq -r .id)
close_reason=$(echo "$issue_json" | jq -r '.close_reason // ""')
priority=$(echo "$issue_json" | jq -r .priority)

# Only high priority
if [[ "$priority" -gt 1 ]]; then
    exit 0
fi

curl -sS -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc \
      --arg text "Closed: $id · $title · reason: $close_reason" \
      '{text: $text}')" \
    || true

exit 0
```

Set executable:

```bash
chmod +x .beads/hooks/on_close
```

Test:

```bash
bd close <some-id> --reason "testing"
# Should see Slack message (and log)
```

## Example: local cache invalidation

If your UI or orchestrator caches bead data in memory, hooks are
the invalidation signal:

`.beads/hooks/on_update`:

```bash
#!/bin/bash
id="$1"

# Tell local service to invalidate its cache
curl -fsS -X POST http://127.0.0.1:8080/invalidate/"$id" || true
```

This is gascity's pattern: the mutation hooks emit events to the
controller, which updates its `CachingStore`.

## Example: external tracker sync

`.beads/hooks/on_update`:

```bash
#!/bin/bash
issue_json=$(cat)
external_ref=$(echo "$issue_json" | jq -r '.external_ref // ""')

# Only sync beads that already have a GitHub issue linked
if [[ -n "$external_ref" && "$external_ref" == gh-* ]]; then
    bd github push "$1" || true
fi
```

Or run `bd <tracker> push` for any tracker.

## Gotchas

- **`bd delete` does NOT fire a hook.** The bead no longer exists to
  attach the event to. See
  [../../gaps-audit.md](../../gaps-audit.md) §A11.
- **Batch operations fire one hook per bead.** A `bd create --file`
  with 10 beads fires `on_create` 10 times.
- **Hooks run asynchronously.** If you need ordering (e.g., commit
  happens then hook happens), beads guarantees "after commit" — but
  not "before the next command runs."
- **Transactions defer hooks to after commit.** Inside
  `RunInTransaction`, hooks accumulate and fire only if the Dolt
  commit succeeds.

## Installing / upgrading

Use `bd migrate hooks` (two words, a subcommand of `bd migrate` —
**not** the older `bd migrate-hooks`):

```bash
bd migrate hooks --dry-run    # preview the migration plan
bd migrate hooks --apply      # install / upgrade hook shims
bd migrate hooks --apply --yes  # non-interactive
```

This is the canonical install/upgrade form. The plan-then-apply
pattern keeps the operation observable.

## Disabling

- `BD_NO_HOOKS=1` env — one-time kill-switch. Hook decorator sees it
  and short-circuits before invoking any script.
- `bd config set no-hooks true` — persistent.

## Testing

There's a `RunSync` variant for testing (`internal/hooks/hooks.go:76`).
External callers can't use it; test by running bd CRUD and checking
hook side effects.

## Git hooks (separate mechanism)

`bd migrate hooks --apply` also writes shims into `.git/hooks/*`.
Different purpose — runs on git operations (commit, push, merge,
checkout) rather than on bead operations.

The `post-merge` and `post-checkout` shims run any chained user hook
(preserved if you had one before) and then auto-import
`.beads/issues.jsonl` into Dolt when `import.auto` is true (the
default; GH#3729). Set `bd config set import.auto false` to suppress
the auto-import while keeping the chained user-hook behaviour.

See [../reference/hook-protocol.md](../reference/hook-protocol.md#2-git-hooks).

## See also

- [../reference/hook-protocol.md](../reference/hook-protocol.md) —
  full protocol reference.
- [../explanation/agent-coordination.md](../explanation/agent-coordination.md)
  — hooks as coordination primitives.

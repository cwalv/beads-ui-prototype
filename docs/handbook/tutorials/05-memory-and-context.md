# Tutorial 5: Memory and session context

Goal: use `bd remember` + `bd prime` for persistent context across
sessions.

## Prereqs

- `bd` installed. If you haven't done tutorial 1, you can still follow
  this without a full init — some commands work outside a bead project.

## What these are for

Two related primitives:

- **`bd remember`** stores a slug-keyed string in the `config` table.
  Not a bead. Survives across sessions.
- **`bd prime`** emits session-start markdown — includes ready work,
  active work, and all stored memories. Wired to session hooks
  (Claude Code, Gemini CLI, etc.) via `bd setup`.

Together: remember once, every future session sees it.

## Step 1: remember a fact

```
$ bd remember "This project uses Go 1.25 and requires GOFLAGS=-mod=mod."
✓ Remembered: this-project-uses-go-1-25-and-requires-goflags-mod
```

The key is auto-generated from the content (slug of first ~8 words).

Memories go into the `config` table under `kv.memory.<slug>`.

## Step 2: list memories

```
$ bd memories
this-project-uses-go-1-25-and-requires-goflags-mod
  → This project uses Go 1.25 and requires GOFLAGS=-mod=mod.
```

Search:

```
$ bd memories "go 1.25"
this-project-uses-go-1-25-and-requires-goflags-mod
  → This project uses Go 1.25 and requires GOFLAGS=-mod=mod.
```

Case-insensitive, matches key or value.

## Step 3: update a memory in place

Use `--key` to set a stable slug:

```
$ bd remember "Use the main branch for all work." --key branch-policy
✓ Remembered: branch-policy

$ bd remember "Use the main branch; feature branches merged via PR." --key branch-policy
✓ Updated: branch-policy
```

The second call updates rather than creates because the key already
exists.

## Step 4: recall a specific memory

```
$ bd recall branch-policy
Use the main branch; feature branches merged via PR.
```

## Step 5: forget

```
$ bd forget branch-policy
✓ Forgot: branch-policy

$ bd recall branch-policy
(not found)
```

Exit code 1 on not found.

## Step 6: see `bd prime`

`bd prime` is the session-start context emitter. Run it manually:

```
$ bd prime
# Beads Workflow Context

> **Context Recovery**: Run `bd prime` after compaction, clear, or new session
> Hooks auto-call this in Claude Code and Codex when a beads workspace is resolved

## Persistent Memories (1)

Stored via `bd remember`. Update in place with `bd remember --key <key> "new content"`. Search with `bd memories <keyword>`. Remove with `bd forget <key>`.

### this-project-uses-go-1-25-and-requires-goflags-mod
This project uses Go 1.25 and requires GOFLAGS=-mod=mod.

# 🚨 SESSION CLOSE PROTOCOL 🚨

...workflow checklist, core rules, command reference...
```

Everything you've stored via `bd remember` appears here. An agent
session that reads this on startup has your accumulated context.

Note: `bd prime` emits a static reference + your memories. It does
**not** embed live `bd ready` / `bd list --status=in_progress`
output — the rules tell the agent to run those commands itself.

### Variants

- `bd prime --memories-only` — emit just the persistent memories
  block. Useful for compact hook contexts (lower token cost).
- `bd prime --hook-json` — wrap the output in the SessionStart hook
  JSON envelope shared by Claude Code, Gemini CLI, and Codex. Required
  for hosts that demand stdout be valid JSON.
- `bd prime --mcp` — force the brief MCP-mode variant (see Step 9).
- `bd prime --export` — emit the default content, ignoring any
  `PRIME.md` override.

### Linear auto-pull

If `LINEAR_API_KEY` is set in the environment (or `linear.api_key`
is in config), every `bd prime` invocation first checks whether your
Linear mirror is stale and shells out to `bd linear sync --pull` if so.
A short note prints to stderr on success; the orientation output is
unaffected.

## Step 7: override `bd prime`

Create a project-specific override:

```
$ cat > .beads/PRIME.md <<'EOF'
# bd-tutorial

- We're learning the beads handbook.
- Run `bd prime` to see this text before any agent session.

## Today's focus
- Finish the tutorials.
- Stretch goal: write a how-to.
EOF
```

Now:

```
$ bd prime
# bd-tutorial

- We're learning the beads handbook.
- Run `bd prime` to see this text before any agent session.

## Today's focus
- Finish the tutorials.
- Stretch goal: write a how-to.
```

The custom file wins. Override chain (first match wins):

1. `./.beads/PRIME.md` (clone-specific).
2. `<resolvedBeadsDir>/PRIME.md` (shared workspace, when beads is
   redirected).
3. `~/.config/beads/PRIME.md` (global per-user default).
4. Built-in default content.

When an override file is used, prime emits **only** that file's
contents — memories and the default workflow rules are NOT appended.
If you want the full default output (including memories), pass
`--export`. If you want just the memories block alongside your
override, run `bd prime --memories-only` separately.

## Step 8: `bd setup` for your editor

Wire `bd prime` to your session-start hook:

```
$ bd setup claude
✓ Wrote .claude/settings.json
  Added SessionStart hook: bd prime
```

Available: `bd setup claude`, `bd setup cursor`, `bd setup gemini`,
`bd setup aider`, …. See `bd setup --help` for the full list.

From now on, every Claude Code session starts by running `bd prime`.
The agent's opening context includes your ready work, your active
work, and all memories.

## Step 9: MCP-aware output

If you use beads via MCP (Anthropic's Model Context Protocol), beads
auto-detects that via `~/.claude/settings.json` and emits a brief
variant. Force it manually:

```
$ bd prime --mcp
# brief output...
```

MCP mode truncates memory values to ~150 chars.

## Gotchas

- **Memories commit to Dolt.** Don't put secrets there — they go to
  Dolt history and are shared with anyone who has the DB.
- **Auto-generated keys may collide.** Two "remembers" with similar
  first words get the same slug. Use `--key` for stable names.
- **`bd prime` silent-fails.** If bd crashes, prime emits nothing and
  exits 0 — the session still starts, it just doesn't have beads
  context. See [../reference/prime-contract.md](../reference/prime-contract.md).
- **Memories are keyed on the `config` table.** Not a bead. Not in
  `bd list`. Not included by `bd export` unless you pass
  `--include-memories` (or `--all`) — they're excluded by default
  because they can contain sensitive agent context.

## Orchestrator variants

Both gastown and gascity install their own session-start mechanisms.
They don't use `bd prime` directly:

- **Gastown** has `gt prime` — renders role-specific context from
  embedded templates, merges beads context.
- **Gascity** has per-agent prompt templates in `internal/templates/`
  that embed context via Go templates. No shell-out to `bd prime`
  typically.

In bare beads (no orchestrator), `bd prime` is canonical.

## You're done

You've walked through:

1. Creating and closing beads (tutorial 1).
2. Dependencies and `bd ready` (tutorial 2).
3. Formulas and molecules (tutorial 3).
4. Mail via a delegate (tutorial 4).
5. Memory and `bd prime` (this tutorial).

That's the core surface. From here:

- Dig into specific tasks: [how-to/](../how-to/README.md).
- Understand the model better: [explanation/](../explanation/README.md).
- Look up details: [reference/](../reference/README.md).

## See also

- [../reference/prime-contract.md](../reference/prime-contract.md) —
  prime details.
- [../reference/bd-commands.md#collaboration-primitives](../reference/bd-commands.md#collaboration-primitives)
  — memory command reference.
- [../explanation/agent-coordination.md](../explanation/agent-coordination.md)
  — memory in the bigger picture.

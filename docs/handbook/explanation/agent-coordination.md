# Agent coordination primitives

How beads supports multi-agent work. Five coordination surfaces live
in beads itself; each orchestrator adds its own.

## The five beads-core primitives

1. **Mail** — `bd mail` (pure delegate; transport is orchestrator's).
2. **Gates** — async wait conditions on beads.
3. **Hooks** — lifecycle events (`.beads/hooks/on_*`) and git hooks.
4. **Memory** — durable facts across sessions (`bd remember`).
5. **Prime** — session-start context injection (`bd prime`).

Each is a mechanism. Policy — *how* work is routed, *when* to nudge,
*who* resolves a gate — lives above beads, in orchestrators or
scripts.

## Mail

### `bd mail` delegates

`bd mail <anything>` parses nothing itself. It reads the delegate
configured via `BEADS_MAIL_DELEGATE` env, `BD_MAIL_DELEGATE` env, or
`mail.delegate` config key — then shells out with all args passed
through verbatim.

Without a delegate, `bd mail` exits 1 with setup instructions.

This is a *deliberate pattern*: beads refuses to implement mail
transport, because transport belongs to whoever runs the agents. The
mail "protocol" is whatever the delegate defines.

### Messages are beads

Both gastown and gascity implement the delegate as bead CRUD:

- A message is a bead with `type="message"`.
- The sender is stored in the `sender` column.
- The recipient is the `assignee`.
- Read/unread is a label (`read`).
- Threading is a label (`thread:<id>`) — beads has schema support for
  `DepRepliesTo` + `ThreadID`, but *neither orchestrator uses it*. See
  [../../gaps-audit.md](../../gaps-audit.md) §A3.

Consequences:

- A bare `bd` install (no orchestrator, no delegate) doesn't have mail.
- `bd show <message-id>` works — a message is just a bead.
- Closing a message archives it (convention).

### Why labels instead of dependencies

Labels are cheap to index and easy to query. `bd list --label
"thread:abc"` returns a thread efficiently; a query walking
`replies-to` deps to reconstruct a thread is fine for two messages
and slow for twenty. The orchestrators made a pragmatic call.

The beads-ui should surface messages as bead-of-type-message, with
label-derived threading. Reading from the dep table would produce
empty threads in practice.

## Gates

A **gate** is a bead that blocks downstream work until a condition
resolves. The blocked work is represented as `blocks` deps from
work-bead → gate-bead.

### Gate columns

On any issue (not just gate-type):

- `await_type` — the condition type.
- `await_id` — condition identifier.
- `timeout_ns` — max wait.
- `waiters` — addresses to notify on close.

Convention: create a gate by setting `issue_type = "gate"` (which is a
custom type — must be configured via `bd config set types.custom "gate,…"`)
and setting `await_type` + `await_id`.

### Gate types

From `cmd/bd/gate.go`:

| `await_type` | Meaning | Resolved by |
|---|---|---|
| `gh:run` | GitHub workflow run. `await_id` is run ID or workflow name. | `gh run view <id>` — status=completed + conclusion in (success, skipped). |
| `gh:pr` | GitHub pull request. `await_id` is PR number. | `gh pr view <id>` — state=MERGED. |
| `timer` | Wall-clock. `timeout_ns` on creation. | Time check. Never escalates. |
| `human` | Manual. | Operator runs `bd close` or `bd gate resolve`. |
| `mail` | Message arrival. | (Not fully wired in the core; orchestrator-mediated.) |
| `bead` | **Vestigial**. Always returns false. Multi-rig routing was removed. |

### Resolving gates

`bd gate check` walks all open gates and auto-closes the satisfied
ones. Can be filtered by `--type=<type>`. Integrate into a cron or
patrol loop.

`bd gate resolve <id>` — manual close.

`bd gate add-waiter <gate-id> <waiter>` — register an agent for
wake-on-close notification. When the gate closes, downstream `blocks`
resolution unblocks their work.

`--escalate` on `bd gate check` triggers escalation via `gt escalate`
(delegated to the orchestrator).

### Per-step gates in formulas

A formula step can carry a `gate:`:

```toml
[[steps]]
id = "wait-for-tests"
title = "Tests pass on main"
gate = { type = "gh:run", id = "test.yml", timeout = "30m" }
```

At cook time, this becomes a gate bead. Closing the gate (manually or
by `bd gate check`) unblocks the dependent step.

### Gates vs the `human` label

Distinct:

- A **gate** with `await_type=human` is a bead with the `gate` type
  that requires manual closure to unblock waiters.
- The **`human` label** on any bead flags it for human review via
  `bd human list`. `bd human respond`/`dismiss` interact via comments.

A bead can have both; they are independent concerns.

## Hooks

Full protocol: [../reference/hook-protocol.md](../reference/hook-protocol.md).

Two hook families, both beads-core:

- **Mutation hooks** — `.beads/hooks/{on_create,on_update,on_close}`.
  Fire on every CRUD. Fire-and-forget, 10s timeout. Stdin is the
  full bead JSON.
- **Git hooks** — `.git/hooks/{pre-commit,post-merge,pre-push,…}`.
  Managed by `bd hooks install`. 300s timeout (configurable).

Orchestrators consume hooks differently:

- **Gascity**: mutation hooks are the primary event bus. Every bd
  write triggers a hook → gascity controller → cache invalidation.
  A broken hook chain means cache drift.
- **Gastown**: doesn't use mutation hooks. Uses Claude Code
  session hooks (`SessionStart`, `PreToolUse`, etc.) installed per
  agent.

### The hook trust model

Hooks are YOUR code. Beads passes an Issue JSON and expects you to
handle it. Don't:

- Trust hook input to come from "your" beads — anyone with write
  access to the DB triggers them.
- Run destructive operations without confirming intent in the hook
  body.
- Make the hook do anything that could take more than 10 seconds.

### Hook blind spots

`DeleteIssue` does NOT fire a hook — the bead no longer exists to
attach the event to. A cache built on hook notification won't see
deletes. See [../../gaps-audit.md](../../gaps-audit.md) §A11.

## Memory

`bd remember "<text>"` stores a slug-keyed string at
`kv.memory.<slug>` in the `config` table. NOT a bead — these are
config rows.

Commands:

- `bd remember "<text>" [--key <slug>]` — create or update.
- `bd memories [search]` — list (or substring-search keys and values).
- `bd recall <slug>` — fetch a single value.
- `bd forget <slug>` — delete.

Key auto-generation: first ~8 hyphen-separated words, lowercased, max
60 chars. Override with `--key <slug>` for stable keys you can update
in place.

### When to use

- Insights that span sessions: "user prefers terse responses."
- Long-term context: "this codebase uses Go 1.25."
- Workflow reminders: "always check Slack before shipping."

Don't use for:

- Per-issue state (use the bead's `notes` or `metadata`).
- Ephemeral TODOs (use `bd todo` or beads themselves).
- Anything confidential — memories commit to Dolt.

### How memories flow into sessions

`bd prime` emits memories at the bottom of its session-start output.
So: remember once, every future session sees it automatically.

## Prime

Full contract: [../reference/prime-contract.md](../reference/prime-contract.md).

`bd prime` is the canonical session-start hook. It emits markdown that
an agent ingests as its opening context:

- Workflow instructions.
- Ready work (`bd ready`).
- Active work (assigned to the actor).
- All memories.
- Session-close protocol reminder.

Wired automatically for supported editors via `bd setup`:

```
bd setup claude   # writes .claude/settings.json with SessionStart hook
bd setup cursor   # writes .cursor/rules/beads.mdc
bd setup gemini   # etc.
```

### Override chain

Per-project overrides via `.beads/PRIME.md`. Example use: put a
pinned "today's focus" there so every session starts grounded.

Resolution: `./.beads/PRIME.md` → shared workspace PRIME.md →
`~/.config/beads/PRIME.md` → default.

### Silent fail

If prime can't run (no DB, crashing bd, missing formula), it exits 0
with no output. The agent session starts without beads context; the
user can manually run `bd ready` to orient.

## How orchestrators extend this

Gastown adds:

- **`gt sling`** — work dispatch. Sets `hook_bead` on the target
  agent bead.
- **Channels & groups** (`gt mail announce/channel/group`) — pub/sub
  and distribution lists layered on mail.
- **Nudges** (`gt nudge`, `internal/nudge/`) — tmux send-keys
  delivery that wakes a live agent mid-session.
- **Escalations** — severity-routed incidents.
- **`hook_bead`** — each agent bead's "active work" pointer (GUPP
  rule).

Gascity adds:

- **`gc sling`** — work dispatch. Sets `gc.routed_to` metadata on
  the work bead.
- **`gc.routed_to` metadata** — the dispatch contract. Workers query
  `bd ready --metadata-field gc.routed_to=<pool>` to find their work.
- **Nudge queue** (`internal/nudgequeue/`) — deferred delivery when
  a target session isn't live; delivers at safe boundaries.
- **Graph-v2 control beads** — `gc.kind` metadata identifies fanout,
  scope-check, workflow-finalize, retry, ralph control beads.
- **Convergence loop** — reconciles wisp state against intended
  shape.

## Canonical dispatch for beads-ui

**Prefer metadata routing.** `gc.routed_to` (or a generic
equivalent) is more queryable, more visible, and more orchestrator-
agnostic than gastown's `hook_bead` field.

**Treat mail as beads of type=message.** The delegate protocol is
noise; the actual data is bead CRUD.

**Treat labels as first-class.** `thread:<id>`, `read`, `channel:<n>`
— these are the de facto mail semantics.

**Gates are first-class.** `bd gate` is a rare case of beads
providing a concrete workflow primitive, not just storage. Surface
gates prominently in any status UI.

**`bd prime` is the session-start primitive,** even in orchestrated
setups — each orchestrator can substitute its own, but the semantics
match.

## See also

- [../reference/hook-protocol.md](../reference/hook-protocol.md) —
  hook wire format.
- [../reference/prime-contract.md](../reference/prime-contract.md) —
  prime details.
- [../reference/metadata-conventions.md](../reference/metadata-conventions.md)
  — `gc.*` and `gt:*` catalogs.
- [../../gaps-audit.md](../../gaps-audit.md) — coordination-related
  gaps (A3, A4, A11).

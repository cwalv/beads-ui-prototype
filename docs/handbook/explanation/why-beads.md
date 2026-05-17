# Why beads exists

Beads ships as `bd` — a single-binary issue tracker with a dolt-backed
SQL store, a CLI, hooks, and a formula/molecule workflow system. It is
not a ticketing system, a Kanban board, or a project-management tool.
It's the *ledger* that multi-agent systems coordinate on.

## The problem shape

Traditional issue trackers (Jira, Linear, GitHub Issues) are built for
humans:

- **Web UI first, API second.** Automation is a second-class citizen.
- **Rate-limited APIs.** A worker loop that polls 100 times a second
  gets throttled.
- **Eventual consistency.** Two writes by the same user often race;
  convergence is minutes, not milliseconds.
- **Server-side auth + multi-tenant.** Every operation is
  network-gated; offline work is a pain.
- **One giant schema.** Customization is type-level custom fields, not
  per-row polymorphism.
- **Schema lock-in.** Adding a field is a company-wide decision.

An AI-agent swarm that writes more than it reads has different needs:

- Sub-second writes.
- Local first (distributed, occasionally synced).
- Cheap per-issue polymorphism (this bead is a message, that bead is a
  session, the next is a recurring patrol).
- Rich dependency graph, enforced efficiently.
- Hooks fire on every mutation.
- A way to re-enter a session and recover context.

Beads picks those knobs.

## Design goals

### 1. The issue is the unit of polymorphism

Beads has one table (`issues`) with ~60 columns. Every coordination
primitive is represented as an issue: a task bead, a gate bead, a
message bead, an event bead, a template (proto) bead, an ephemeral
(wisp) bead. Each carries a `type` and optional type-specific columns
(`event_kind` for events; `await_type`/`await_id` for gates; `mol_type`
for molecules).

Orchestrators extend this with custom types (`agent`, `rig`, `queue`,
`convoy`, `session`) registered via `bd config set types.custom "…"`.

The result: one wire shape, many meanings. A UI that handles one kind
of bead can handle all of them, given the metadata.

### 2. Dolt is the database

Dolt (dolthub.com) is a version-controlled SQL database. Each write is
a commit. Branches, merges, pull requests — all the git verbs, for
data.

Why:

- **Offline-first.** Agents work against a local Dolt; sync happens
  when convenient.
- **Merge conflicts are diff-visible.** If two clones change the same
  bead, the conflict surfaces in `dolt status`.
- **History is part of the contract.** `bd compact --dolt` squashes
  old commits; federation sync is just Dolt remote push/pull.

See [the-store-architecture.md](the-store-architecture.md) for how the
`issues` table is committed and the `wisps` table is kept local via
`dolt_ignore`.

### 3. Ephemeral is first-class

Not everything belongs in history. Heartbeats, patrol reports, wisp
escalations — these are operationally important for 24 hours and
useless forever after.

Beads solves this with a mirrored `wisps` table. Same schema, same
queries, but dolt-ignored. Writes skip `DOLT_COMMIT`. TTLs on
`wisp_type` drive automatic compaction.

### 4. Dependencies are the graph

20 well-known dependency types (see
[../reference/dependency-types.md](../reference/dependency-types.md)).
Four affect the ready-work computation; sixteen are informational.

Cycle detection runs on `blocks` and `conditional-blocks` additions.
Cross-prefix references are permitted — you can depend on a bead in
another rig's database. The target doesn't need to exist at dep-add
time.

### 5. Hooks are the event bus

Three mutation hooks (`on_create`, `on_update`, `on_close`) fire on
every CRUD. They're fire-and-forget, 10-second timeout,
output-truncated. An orchestrator wires them to its own event bus;
a single user wires them to a notification pipeline.

Hooks are how you keep caches in sync, how you notify collaborators,
how you invalidate UI views.

### 6. `bd prime` is the session-start protocol

AI-agent sessions need context. `bd prime` emits markdown — ready
work, active work, stored memories — that the agent ingests at
session start. A `PRIME.md` file in the project can override it;
`bd remember` injects durable facts.

Without `bd prime` (or its orchestrator equivalent), each agent session
starts from scratch, re-reading the codebase and re-discovering what's
going on. Prime is the flywheel that makes long-running agent work
feasible.

### 7. Formulas + molecules encode workflow

A **formula** is a TOML workflow template. You `cook` it into a
**proto** (a template bead), then `pour` to create a persistent
**molecule** (children execute in dependency order) or `wisp` to
create an ephemeral one.

`bd mol current <id>` tells a worker which step is ready next.
`bd mol progress <id>` reports completion. This is how multi-step
workflows survive sessions — the shape is in the bead graph, not in
a worker's memory.

See [the-pour-pipeline.md](the-pour-pipeline.md).

## What beads is NOT

- **Not a project manager.** No Gantt charts, no capacity planning.
- **Not a workflow engine.** It stores the shape; orchestrators run it.
- **Not an agent runtime.** `tmux`, ACP, cloudcli — those live in
  orchestrators. Beads just tracks state.
- **Not a role system.** "Agent", "crew", "mayor", "deacon" are all
  orchestrator concepts. Beads knows about beads.
- **Not a messaging system.** `bd mail` is a delegate protocol — it
  shells out to whatever you configure.
- **Not a rendering layer.** `--json` output is the contract; rendering
  is your problem.

## The orchestrators fill the gaps

Gastown (`gt`) and gascity (`gc`) independently built:

- Agent identity and lifecycle.
- Work dispatch (how a bead reaches a worker).
- Session management (tmux / ACP / cloudcli / k8s).
- Live messaging (nudges, channels).
- Merge queue (refinery, scheduler).
- Event logs.

Neither imports beads as a Go package. Both shell out to `bd`.

The beads-ui sits at the same layer as the orchestrators: consumes
`bd`, doesn't replace it. See
[beads-and-orchestrators.md](beads-and-orchestrators.md) for how the
three pieces fit.

## What success looks like

- An agent starts a session. `bd prime` tells it what to do.
- It runs `bd ready` — a short list.
- It claims (`bd update --claim`), does work, closes with
  `--continue` or `--suggest-next`.
- Hooks fire; caches update; the next agent's `bd ready` reflects
  the change in real time.
- Memories accumulate; the next session starts with more context than
  the last.
- A week later, `bd compact --dolt` squashes stale history; workflow
  continues.

Beads as plumbing. The orchestrator tells agents what to do with it;
the UI makes it legible to humans.

## See also

- [the-store-architecture.md](the-store-architecture.md) — how data
  physically lives.
- [the-pour-pipeline.md](the-pour-pipeline.md) — workflows.
- [agent-coordination.md](agent-coordination.md) — the coordination
  primitives.

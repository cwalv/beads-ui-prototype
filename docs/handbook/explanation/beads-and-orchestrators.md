# Beads and its orchestrators

Beads was designed *for* gastown. Gascity is gastown's successor. This
doc explains the relationship, the original intent, the evolution,
and where beads-ui fits.

## The trajectory

Roughly:

```
    beads (the ledger)
       │
       │  consumed by
       ▼
     gastown ─────────(evolves into)──────▶  gascity
       │                                      │
       │  uses bd CLI                         │  uses bd CLI
       │  (shell-out)                         │  (shell-out + store interface)
       │                                      │
       │  tight role catalog:                 │  role-agnostic:
       │  mayor / deacon / dog /              │  "ZERO hardcoded roles"
       │  witness / refinery /                │  all roles come from config
       │  polecat / crew                      │
       │                                      │
       ▼                                      ▼
     tmux + gh + dolt                       tmux / ACP / cloudcli / k8s
```

Both orchestrators treat `bd` as an external binary; neither imports
it as a Go package. Both layer role systems, dispatch, and runtime
management on top of the same `bd` surface.

## Why beads was extracted

In gastown, most of the coordination between agents happens through
the bead graph. Every agent writes, every agent reads, every agent
depends on the graph being fast, local, and recoverable.

Before beads existed, gastown's equivalent was likely ad-hoc — JSON
files, maybe a local SQLite, possibly a git repo. But:

- Multiple agents writing concurrently need real transactions.
- Agents crash and restart — state must survive.
- History matters for debugging, for audit trails, for compaction.
- The graph is the real API; any agent has to be able to query it
  precisely.

Beads extracts that into a dedicated tool with a narrow contract:
bead CRUD + a dependency graph + hooks + formulas. Everything else —
dispatch, roles, session management — belongs upstream.

## The design contract

Beads commits to:

1. **Local-first writes.** Dolt-backed, offline-capable. A worker
   on a laggy VPN shouldn't stall.
2. **Per-write durability.** Every mutation is a commit. Crashes
   don't lose state.
3. **Hooks that fire on every mutation.** Orchestrators can build
   caches, event buses, downstream pipelines.
4. **A session-start contract (`bd prime`).** Agents can recover
   context across session boundaries.
5. **Extensibility via custom types and metadata.** Orchestrators
   extend the schema without requiring a bd change.
6. **A formula/molecule abstraction.** Workflows are data, not
   code.

In return, beads DOESN'T commit to:

- A role system.
- A dispatch mechanism.
- Agent session management.
- Live messaging (nudges).
- Merge queues.
- Event log aggregation across agents.

Those are orchestrator concerns. Beads stays narrow.

## Gastown's choices

Gastown embraces a specific role catalog:

- **Mayor** — town-scope coordinator. One per town.
- **Deacon** — town-scope infrastructure patroller. Runs dogs.
- **Witness** — rig-scope observer. Watches polecats; signals
  merge-ready.
- **Refinery** — rig-scope merger. Runs the batch-bisect merge
  queue.
- **Polecat** — worker. Does the actual implementation work.
- **Crew** — human workspace. Long-lived user sessions.
- **Dog** — infrastructure worker (compactor, reaper, archiver).

Each agent is a bead. Agent lifecycle writes description fields in
the bead for `agent_state`, `hook_bead`, etc. Dispatch sets
`hook_bead` on the target agent bead — the agent reads it on wake
(GUPP: "if there's work on your hook, YOU MUST RUN IT").

This is a tight coupling. Gastown's code assumes these roles exist;
adding a new role requires touching gastown's Go code.

## Gascity's rewrite

Gascity is what gastown would look like if someone started over with
"zero hardcoded roles" as an invariant:

- **Agents are config objects.** `[[agent]]` in `city.toml` defines
  a template: provider, prompt template, pool size, scale_check.
  Beads itself doesn't know about this.
- **Dispatch is metadata.** `gc sling` writes `gc.routed_to` on the
  work bead. Workers query `bd ready --metadata-field
  gc.routed_to=<pool>`.
- **Packs and imports.** City-level, rig-level, user-level config
  layers compose. Communities can share agent templates.
- **Store is a first-class abstraction.** `internal/beads/` has a
  `Store` interface with four implementations — `MemStore`,
  `FileStore`, `BdStore`, `exec:<script>`. Tests can run
  without bd. A hypothetical future beads replacement could slot in.
- **Events are a registry.** Every event type constant has a
  registered payload; a test enforces the invariant.
- **Graph-v2 workflows.** A new formula contract (`contract =
  "graph.v2"`) adds control beads — fanout, scope-check,
  workflow-finalize — for DAGs that evaluate runtime conditions.

The tight/specific gastown patterns become loose/generic gascity
patterns. Some things that gastown hard-coded, gascity configures.

## Reduced gastown concepts in gascity

Which gastown concepts survive in gascity, which change, which
disappear:

| Concept | Gastown | Gascity | Canonical interpretation |
|---|---|---|---|
| Agent identity as a bead | yes (hq-mayor, etc.) | yes (via `[[agent]]`) | **Keep**: the idea that agents have durable bead identity is canonical. |
| `hook_bead` dispatch | yes | **replaced by `gc.routed_to` metadata** | Gascity's model is cleaner; canonical. |
| Mayor/Deacon/Dog specifics | hardcoded | configured | Canonical choice: configuration. |
| Convoy | `internal/convoy/` + CLI | `internal/convoy/` + CLI (different code) | Independently evolved. Both valid; pick the one your orchestrator ships. |
| Merge queue (refinery) | yes, highly specific | via scheduler + orders | Gascity generalizes. |
| Mayor-as-mail-hub | yes | no fixed mayor — mail between any agents | Gascity generalizes. |
| Nudge as tmux send-keys | yes | provider-agnostic via runtime.Provider | Gascity abstracts. |
| Crew (human sessions) | yes, first-class | via named_session config | Same idea; different expression. |
| Dog (infrastructure workers) | yes, first-class | via patrol orders | Generalizes to `trigger: cooldown`/`cron`. |
| Seance (predecessor-session discovery) | yes | yes | Kept. |
| Wasteland (DoltHub federation) | yes | implicit via `bd federation` | Kept (but gascity doesn't heavily use). |

Patterns gastown **pushed into beads** (now canonical):

- `type="message"` for mail.
- `is_template=true` and `.beads/molecules.jsonl` for proto storage.
- The four formula types.
- Wisp / ephemeral routing.
- `bd prime` contract.
- Hooks as the event bus model.

Patterns gastown **kept in gastown** (not pushed into beads):

- The specific role catalog (mayor/deacon/etc.).
- Description-field metadata (`fields.go` key-value parsing).
- Rig-level `.beads/redirect` sharing pattern (beads supports the
  mechanism; gastown invented the usage pattern).

## What beads-ui is for

The beads-ui at `github.com/cwalv/beads-ui-prototype` sits at the
same architectural layer as gastown/gascity:

```
              beads (the ledger)
                    │
                    │  consumed by
                    ▼
   ┌──────────────┬──────────────┬──────────────┐
   │   gastown    │    gascity   │   beads-ui   │
   │   (roles)    │    (roles)   │    (UI)      │
   └──────────────┴──────────────┴──────────────┘
```

A beads-ui is not a successor to gascity; it's a peer. A browser
pointed at a beads install, with or without an orchestrator running,
should:

- Show beads, deps, labels, metadata.
- Let operators create, edit, close.
- Surface gates, molecules, mail.
- Reflect ongoing work (via hooks or polling).
- Work with gastown / gascity-specific conventions when present.

The UI's design constraints:

- **Don't depend on an orchestrator.** A bare `bd` install should
  render.
- **Recognize orchestrator conventions when present.** Show
  `gc.routed_to` if it's set. Show `thread:<id>` labels as
  threads. Show `gt:agent` beads as agents.
- **Don't reinvent.** `bd mol current` is the step runner; use it
  rather than computing step state in the UI.

The pragmatic canonical path for the UI:

1. Lead with **beads-core concepts**.
2. Prefer **gascity's metadata-based dispatch** model when adapting
   to orchestrator patterns (cleaner, more queryable).
3. Use **gascity's label-based conventions** for mail threading and
   read-state (matches shipped code).
4. Surface **gastown-specific conventions** only when explicitly
   pointed at gastown — don't make the generic UI look like gastown.

## Is there a canonical orchestrator?

No. Both are valid, actively maintained, and independently designed.
Gascity **is** the successor in the sense that it was designed after
gastown with lessons learned; but they're separate codebases and
neither subsumes the other.

For the UI: treat neither as canonical. Read bead state. Label your
orchestrator-specific features clearly ("this panel shows
gastown-specific info").

## See also

- [why-beads.md](why-beads.md) — the design goals.
- [canonical-vs-vestigial.md](canonical-vs-vestigial.md) — pragmatic
  guidance on what to build against.
- [../../04-gastown-integration.md](../../04-gastown-integration.md)
  — gastown specifics.
- [../../05-gascity-integration.md](../../05-gascity-integration.md)
  — gascity specifics.

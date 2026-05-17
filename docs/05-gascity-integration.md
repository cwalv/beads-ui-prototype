# 05 — gascity integration

Authoritative reference for how [gascity](https://github.com/gastownhall/gascity)
uses `bd` and what concepts it layers on top. Feeds the beads-ui work at
`github.com/cwalv/beads-ui-prototype`.

Companion reading:
- [01-data-model.md](01-data-model.md) and [02-cli-surface.md](02-cli-surface.md)
  cover beads itself — bead schema, CLI, hooks. This doc references them
  rather than restating.
- [03-concepts.md](03-concepts.md) covers which concepts are first-class in
  beads vs. layered above. Contradictions between gascity's use and beads's
  intended semantics are flagged in the final section here.
- [04-gastown-integration.md](04-gastown-integration.md) covers the sister
  orchestrator. Deltas gastown→gascity are noted inline where material.
- Operator notes specific to the city under study:
  - `projects/foundations/docs/gc-chost-city-deviations.md` — how this
    particular city diverges from `gc init` defaults.
  - `projects/foundations/docs/gascity-troubleshooting-notes.md` — dolt /
    port / pack diagnostics from prior incidents.

Paths are workspace-relative; `github/gastownhall/gascity/...` is the
gascity repo root.

---

## 1. Architecture snapshot

gascity is an **orchestration-builder SDK** — a Go toolkit for composing
multi-agent workflows where all role behavior is user-supplied
configuration (`CLAUDE.md`/`AGENTS.md` at gascity root; "ZERO hardcoded
roles" is an invariant). It presents itself as *five primitives and four
derived mechanisms* on top of what it calls the **MEOW stack** (Molecular
Expression of Work).

The five primitives are: **agent protocol, task store (beads), event bus,
config, prompt templates**. The derived mechanisms are: **messaging,
formulas/molecules, dispatch (sling), health patrol**
(`github/gastownhall/gascity/AGENTS.md` — "five primitives / four derived
mechanisms").

### How gascity talks to beads

gascity does **not** import beads as a Go package. Like gastown, it
**shells out to the `bd` CLI** for all persistence. Inside the repo, a
grep for `gastownhall/beads` returns only install/tool hints; no
`beads.Client` or in-process library use. The shell-out happens through
`internal/beads/bdstore.go`, which implements the gascity-side `Store`
interface via `exec.CommandContext(ctx, "bd", args...)`
(`internal/beads/bdstore.go:28-87`).

### The `internal/beads/` wrapper layer — what makes gascity different

gastown's `internal/beads/` is a thin CLI wrapper. gascity's is an entire
**universal persistence abstraction** for the orchestrator:

```
                  ┌────────────────────────────────────┐
                  │  beads.Store interface             │
                  │  (internal/beads/beads.go:133-228) │
                  └──────────────┬─────────────────────┘
                                 │ implemented by
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
     ┌──────────┐          ┌──────────┐          ┌──────────────┐
     │ MemStore │          │FileStore │          │   BdStore    │
     │  (tests) │          │ (small   │          │ (shells out  │
     │          │          │  local)  │          │  to bd CLI)  │
     └──────────┘          └─────┬────┘          └──────┬───────┘
                                 │                      │
                                 │ wraps                │ wrapped by
                          ┌──────▼──────┐        ┌──────▼───────┐
                          │  FileFlock  │        │ CachingStore │
                          │  (flock.go) │        │              │
                          └─────────────┘        └──────────────┘

                          Plus:
                          - contract/ — dolt endpoint resolution
                          - exec/     — pluggable shell-out backend
                          - graph_apply — atomic bead-graph creation
```

Everything in gascity is a bead. Tasks, mail (`type: "message"`),
sessions (`type: "session"`), agents (`type: "agent"`), rigs
(`type: "rig"`), molecules / wisps (`type: "molecule" | "wisp"`),
convoys (`type: "convoy"`) — all go through the same store
(`internal/beads/beads.go:15-31` and `IsReadyExcludedType`,
`beads.go:84-99`). The beads CLI's `GetReadyWork` exclusion list is
deliberately mirrored here.

### Concept delta vs. beads

What gascity **adds** on top of beads (each is reviewed in its own
section below):

| Concept                         | Where it lives                          |
|---------------------------------|-----------------------------------------|
| Dispatch / `gc sling`           | `internal/sling/`, `cmd/gc/cmd_sling.go`|
| Formulas (TOML workflow specs)  | `internal/formula/`                     |
| Molecules / wisps               | `internal/molecule/`                    |
| Convoys (batch containers)      | `internal/convoy/`                      |
| Orders (scheduled dispatch)     | `internal/orders/`                      |
| Source workflows (singleton)    | `internal/sourceworkflow/`              |
| Mail (beads with type=message)  | `internal/mail/` + `mail/beadmail/`     |
| Nudge queue (deferred delivery) | `internal/nudgequeue/`                  |
| Sessions / agents / runtime     | `internal/session`, `runtime`, `worker` |
| Hooks (bd + provider hooks)     | `internal/hooks/`                       |
| Events log (infra observation)  | `internal/events/`                      |
| Session transcripts             | `internal/sessionlog/`                  |
| Config / packs / overlays       | `internal/config/`, `overlay`, `packman`|
| Dolt auth                       | `internal/doltauth/`                    |
| Convergence (reconciler)        | `internal/convergence/`                 |
| Supervisor (machine registry)   | `internal/supervisor/`                  |

What gascity **reuses from beads**:

- The bead schema (with type strings it's free to choose).
- Dependencies (`bd dep add`).
- Labels + metadata as untyped extension points.
- `bd ready` as the ready-work query (with a small exclusion list).
- `bd hooks` as the write-side event bus — see §7.
- `bd init --server` for Dolt-backed storage.

What gascity **does not use from beads**:

- `bd formula` / `bd mol` — gascity has its own formula compiler and
  molecule instantiator. Almost all of the TOML workflow logic is
  gascity-native (see §4 and §11).

---

## 2. Storage wrapper deep dive: `internal/beads/`

### 2.1 The `Store` interface

`internal/beads/beads.go:133-228` defines `Store`, the interface all
persistence implementations satisfy. Key mutation methods: `Create`,
`Update`, `Close`, `CloseAll`, `Delete`, `SetMetadata`,
`SetMetadataBatch`, `DepAdd`, `DepRemove`
(`beads.go:137-210`). Key read methods: `Get`, `List`, `ListOpen`,
`Ready`, `Children`, `ListByLabel`, `ListByAssignee`,
`ListByMetadata`, `DepList` (`beads.go:141-194`). `Ping` verifies the
store is operational (`beads.go:212-214`).

Every implementation must: assign a unique non-empty ID, default
`Status="open"` and `Type="task"`, and set `CreatedAt` on `Create`
(`beads.go:129-132`). ID format is implementation-specific — `gc-N` for
in-process stores, `bd-XXXX` (or the configured prefix) for `BdStore`.

The `Bead` struct is gascity's domain model for a beads bead — mostly
aligned with the bd wire format but with JSON tags noted as matching
("`issue_type`" for Type, "`parent`" for ParentID —
`beads.go:17-26`). The domain-level `Metadata` is
`map[string]string`; coercion from `json.RawMessage` happens at the
wire boundary (see §2.6).

### 2.2 `ListQuery` — the query surface

`internal/beads/query.go:24-44` defines `ListQuery`:

```go
type ListQuery struct {
    Status, Type, Label, Assignee, ParentID string
    Metadata       map[string]string
    CreatedBefore  time.Time
    Limit          int
    IncludeClosed  bool
    AllowScan      bool
    Live           bool
    Sort           SortOrder
}
```

Conjunctive semantics — all populated fields must match
(`query.go:62-90`). A zero-value query requires `AllowScan: true` to
prevent accidental full-scans (`query.go:46-55`, enforced at call sites).
`Live: true` bypasses `CachingStore` and reads straight from the backing
store (`query.go:40-42`). `IncludeClosed` extends the default "exclude
closed" filter.

Sort orders are `SortDefault` (unchanged), `SortCreatedAsc`,
`SortCreatedDesc` (`query.go:14-22`). `ApplyListQuery` runs in-memory
filter/sort/limit on returned slices (`query.go:101-114`) so all stores
enforce consistent semantics after the backend returns its candidate set.

### 2.3 `MemStore` — tests and small tutorials

`internal/beads/memstore.go` (438 lines) backs the interface with a
slice + mutex. IDs are `gc-N` with a monotonic counter
(`memstore.go:76-77`). Sole persistence: in-memory. Thread-safe via
`sync.Mutex` (`memstore.go:16`). Tests across gascity use this or
`NewCachingStoreForTest` (`caching_store.go:87-91`).

### 2.4 `FileStore` — small local cities

`internal/beads/filestore.go` (346 lines) embeds `*MemStore`
(`filestore.go:24`) and adds JSON persistence. Every mutating op
follows: **acquire flock → reload from disk → mutate → save atomically
→ unlock** (`filestore.go:93-140`). Atomic save is temp-file + rename
(`filestore.go:327-345`). On save failure, the in-memory state rolls
back to match disk (`filestore.go:105-107`, `128-129`).

The on-disk format is:

```go
type fileData struct {
    Seq   int
    Beads []Bead
    Deps  []Dep
}
```
(`filestore.go:14-18`). Single JSON document per city.

### 2.5 `FileFlock` — cross-process serialization

`internal/beads/flock.go` (61 lines) defines a `Locker` interface and
the `FileFlock` implementation. `Lock()` opens the lock file
(`<path>.lock`), takes `syscall.LOCK_EX` via `syscall.Flock`
(`flock.go:31-42`). `Unlock()` releases then closes
(`flock.go:45-54`). A no-op `nopLocker` is available for in-memory
filesystem tests (`flock.go:56-61`).

This is **advisory POSIX flock**. It serializes concurrent CLI invocations
of gc against the FileStore (e.g., controller daemon + ad-hoc CLI).

### 2.6 `BdStore` — the production path

`internal/beads/bdstore.go` (909 lines) is the largest file in the
package. It satisfies `Store` by shelling out to the `bd` binary.
Key structure:

- `CommandRunner` type — `func(dir, name string, args ...string) ([]byte, error)`
  — lets tests inject a fake runner (`bdstore.go:21-23`).
- `ExecCommandRunner` / `ExecCommandRunnerWithEnv` — the production
  runner (`bdstore.go:25-87`). It wraps `os/exec` with:
  - A **120-second context timeout** per call
    (`bdstore.go:56-57`, `72-79`). Timeout error includes stderr.
  - A `WaitDelay` of 2s to forcibly close I/O pipes
    (`bdstore.go:59`).
  - Best-effort **trace logging** to `$GC_BD_TRACE` (if set) — one line
    per call with timestamp/status/duration/dir/cmd/args/err
    (`bdstore.go:38-54`, `74`, `81-84`).
  - **Telemetry recording** for every `bd` call via
    `telemetry.RecordBDCall` (`bdstore.go:67-71`).
- `NewBdStore(dir, runner) *BdStore` — dir is the city root (where
  `.beads/` lives) (`bdstore.go:99-110`).
- Admin ops (not in the `Store` interface because MemStore/FileStore
  don't need them): `Init(prefix, host, port)` invokes
  `bd init --server -p <prefix> --skip-hooks` with optional
  `--server-host` / `--server-port` for remote Dolt
  (`bdstore.go:112-129`). `ConfigSet(key, value)` wraps
  `bd config set` (`bdstore.go:132-138`). `Purge` is a safety-circuit
  wrapped `bd purge --json` for closed ephemeral beads
  (`bdstore.go:140-150` and following).

For every domain method, `BdStore` marshals arguments onto `bd`'s CLI,
parses JSON output, and maps status semantics — notably collapsing bd's
6-status surface (open, in_progress, blocked, review, testing, closed)
down to gascity's 3 (open, in_progress, closed)
(`bdstore.go:389-398`).

### 2.7 `CachingStore` — reads from memory, writes through

`internal/beads/caching_store.go` (300 lines) wraps any `Store`
(production: `*BdStore`; tests: anything). Goal: avoid spawning `bd list`
subprocesses on every read. The docstring calls out that
event-driven invalidation is why this only makes sense over BdStore
(`caching_store.go:14-23`).

**State machine** (`caching_store.go:42-49`):

```
cacheUninitialized → cachePartial → cacheLive
                                  ↘
                                    cacheDegraded
```

- `cachePartial`: `PrimeActive` loaded `open + in_progress` — active
  queries hit the cache, closed-bead queries still delegate
  (`caching_store.go:106-132`).
- `cacheLive`: full scan complete. `Prime` retries up to 3 times with
  linear backoff when `bd list` times out under concurrent Dolt load
  (`caching_store.go:137-176`, `140-149`).
- `cacheDegraded`: after 5 consecutive sync failures
  (`caching_store.go:68-70`). Reads fall back to the backing store.

**Indices** (`caching_store.go:27-30`):
- `beads map[string]Bead` — keyed by ID.
- `deps map[string][]Dep` — "down" direction (what this ID depends on),
  per `caching_store_reads.go:243-246`.
- `dirty map[string]struct{}` — IDs whose post-write refresh failed;
  they force delegation to the backing store on next read
  (`caching_store_writes.go:37`, `_reads.go:24-26`).

**Reconciler cadence** (`caching_store.go:71-73`):
- 30s poll for ≤1 000 beads.
- 60s for 1 000–5 000.
- 120s for ≥5 000.

Full scan via `caching_store_reconcile.go:63-155`. It diffs returned
beads against cache, emits `bead.created / .updated / .closed` events
for observers (`caching_store_reconcile.go:105-131`,
`caching_store_events.go:115-139`). External writes (agents running
`bd` directly) are picked up via bd's write-side hooks (§7) → event
bus → `ApplyEvent` (`caching_store_events.go:15-53`) — the reconciler
is a watchdog, not the primary invalidation path.

### 2.8 `graph_apply` — atomic bead-graph creation

`internal/beads/graph_apply.go` (78 lines) + `bdstore_graph_apply.go`
(56 lines) define a **staged-edits / transactional** API for creating a
precomputed bead graph in one call to bd.

Types:

- `GraphApplyPlan{CommitMessage, Nodes, Edges}` — the caller-built plan.
- `GraphApplyNode{Key, Title, Type, Priority, Description, Assignee,
  AssignAfterCreate, From, Labels, Metadata, MetadataRefs, ParentKey,
  ParentID}` — `Key` is a caller-defined stable identifier (typically a
  recipe step id) (`graph_apply.go:23-38`).
- `GraphApplyEdge{FromKey|FromID, ToKey|ToID, Type, Metadata}`
  (`graph_apply.go:40-49`) — dependency edges, referenced either by
  symbolic key or concrete ID.
- `GraphApplyResult{IDs map[string]string}` — key → concrete bead ID
  (`graph_apply.go:51-54`).

`BdStore.ApplyGraphPlan` marshals the plan to JSON, writes it to a temp
file under `.gc/tmp/`, and runs `bd create --graph <path> --json`
(`bdstore_graph_apply.go:13-56`). `ValidateGraphApplyResult`
(`graph_apply.go:58-78`) makes sure every requested key has a concrete
ID in the result.

This is the path `internal/molecule/` uses to instantiate compiled
formulas atomically — no partial molecule if `bd` crashes mid-create.

### 2.9 `contract` — Dolt endpoint resolution

`internal/beads/contract/connection.go` (682 lines) +
`contract/files.go` (672 lines) own canonical beads/Dolt config and
endpoint resolution.

Core types:

- `DoltConnectionTarget{Host, Port, Database, User, EndpointOrigin,
  EndpointStatus, External}` — the resolved tuple
  (`contract/connection.go:18-27`).
- `EndpointOrigin` enum (`contract/files.go`):
  - `managed_city` — Dolt started by the Gas City runtime.
  - `city_canonical` — external Dolt defined at city level.
  - `inherited_city` — rig inherits its city's endpoint.
  - `explicit` — rig defines its own external endpoint.
- `EndpointStatus`: `verified` / `unverified`.

`ResolveDoltConnectionTarget(fs, cityRoot, scopeRoot)`
(`contract/connection.go:70-115`) reads `<scopeRoot>/.beads/config.yaml`,
derives legacy fallbacks if missing, validates invariants
(managed ⇒ no endpoint stored; explicit ⇒ port required; inherited ⇒
city endpoint resolves), and returns a host/port for clients. Database
defaults to `beads`, overridden by `<scope>/.beads/metadata.json`'s
`dolt_database` field (`connection.go:94-98`). For `managed_city`,
host is `127.0.0.1` and port is read from runtime state JSON
(`connection.go:100-108`).

`ErrManagedRuntimeUnavailable` (`connection.go:52-53`) is the
specific error surfaced when managed Dolt runtime state can't be read
— this is the error gascity shows when operators accidentally connect
to a city whose `gc` controller isn't running.

### 2.10 `exec` — pluggable shell-out backend

`internal/beads/exec/exec.go` (457 lines) + `exec/json.go` (99 lines)
implement `beads.Store` by delegating every operation to a
**user-supplied script** via fork/exec. This is how `[beads].provider =
"exec:<script>"` in city.toml works (see §9).

Wire protocol:

- The script is invoked as `<script> <op> [args...]` with optional JSON
  on stdin.
- Exit codes: `0` = success, `1` = error (stderr carries the message),
  `2` = unknown operation → treated as success (forward-compatible)
  (`exec.go:23-24`, `99-103`).
- 30 second timeout per call (`exec.go:40-41`, `80-81`).

Operations (`exec.go:195+`, `json.go`):

- `create` — stdin: JSON create request.
- `get <id>`
- `update <id>` — stdin: JSON update request.
- `close <id>`
- `delete --force <id>`
- `list [--status=...] [--assignee=...] [--type=...] [--limit=N]`
- `list-by-label <label> <limit>`
- `children <parent-id>`
- `ready`
- `set-metadata <id> <key>` — stdin: value bytes.
- `dep-add <issueID> <dependsOnID> <depType>`
- `dep-remove <issueID> <dependsOnID>`
- `dep-list <id> <direction>`

Wire types (`json.go`): `createRequest`, `updateRequest`, `beadWire` —
kept intentionally separate from the domain `Bead` struct. Metadata
comes back as `map[string]json.RawMessage` and is coerced to
`map[string]string` by `coerceMetadata` (`exec.go:177-192`). Numbers
and booleans fall back to the raw JSON text as a string — this is the
one place gascity's "metadata is string-string" invariant bends for
forward compatibility with back-ends that preserve richer types.

Environment sanitization (`exec.go:46-72`): before invoking the
script, the env is stripped of all `BEADS_*`, `GC_DOLT_*`, and a curated
list of `GC_*` scope keys — preventing orchestrator secrets from
leaking into user scripts. Overrides provided via `SetEnv` are merged
deterministically (keys sorted, `exec.go:55-62`).

Error handling: `isNotFoundError` checks stderr for "not found" / "no
issue found" (`exec.go:119-122`) and maps to `beads.ErrNotFound` so
callers can use `errors.Is`.

### 2.11 `live_ready` — bypass the cache

`internal/beads/live_ready.go` (14 lines) defines a single function:

```go
func ReadyLive(store Store) ([]Bead, error) {
    if cached, ok := store.(backingStore); ok && cached.Backing() != nil {
        return cached.Backing().Ready()
    }
    return store.Ready()
}
```

Purpose: lifecycle gates (dispatch decisions, drain checks) that must
observe external mutations immediately rather than cache-delayed. If
`store` is a `CachingStore`, `ReadyLive` unwraps to the backing
`BdStore.Ready()` (one `bd ready` subprocess). Callers treat the live
read as a consistency boundary.

### 2.12 `query.go` (again), `memstore.go`, `filestore.go` — the tests

Each store has a dense test file next to it — 704 lines for
`caching_store_test.go`, 638 for `filestore_test.go`, 537 for
`memstore_test.go`, 1593 for `bdstore_test.go`. Conformance is enforced
in `beadstest/conformance.go` — a single suite all backends run, so the
wire-level difference between MemStore and BdStore is testable.

---

## 3. Dispatch — `gc sling`, pools, and routing metadata

### 3.1 `gc sling` CLI

`cmd/gc/cmd_sling.go` (1 771 lines) registers `gc sling`
(`cmd_sling.go:37-125`). Usage:

```
gc sling [target] <bead-or-formula-or-text>
```

Two-arg form: explicit target. One-arg form: target derived from the
bead's rig prefix via `rig.default_sling_target`
(`cmd_sling.go:207-233`). Formula or inline-text forms require an
explicit target.

Flags (`cmd_sling.go:104-123`):

- `--formula / -f` — treat the argument as a formula name.
- `--on <formula>` — attach a wisp from <formula> to the existing bead.
- `--no-formula` — suppress the agent's default sling formula.
- `--stdin` — read bead text (first line = title, rest = description).
- `--dry-run / -n` — preview, don't mutate.
- `--title / -t <s>` — custom wisp-root title.
- `--var key=value` — repeatable; variable substitution for formula.
- `--merge direct|mr|local` — merge strategy for source workflows.
- `--no-convoy` — skip auto-convoy.
- `--owned` — mark the auto-convoy as owned (skip auto-close).
- `--nudge` — nudge the target after routing.
- `--force` — suppress warnings; allow cross-rig routing.
- `--scope-kind city|rig` + `--scope-ref <ref>` — logical workflow
  scope for graph.v2 launches.

Inline text: if the argument is neither a recognizable bead id nor a
known formula, `gc sling` creates a new bead of `Type: "task"` with the
text as the title, then routes it (`cmd_sling.go:164-184`, `265-272`).

### 3.2 The routing primitive

Routing sets `gc.routed_to` metadata on the bead. The built-in router
is `cliBeadRouter` (`cmd/gc/cmd_sling.go:459-484`):

```go
func (r cliBeadRouter) Route(_ context.Context, req sling.RouteRequest) error {
    ...
    if agentCfg, ok := findAgentByQualified(..., req.Target); ok &&
        isCustomSlingQuery(agentCfg) {
        // agent has custom sling_query — shell out.
        slingCmd := sling.BuildSlingCommandForAgent(
            "sling_query", agentCfg.EffectiveSlingQuery(),
            req.BeadID, r.deps.CityPath, ..., agentCfg, r.deps.Cfg.Rigs, ...)
        _, err := r.deps.Runner(req.WorkDir, slingCmd, req.Env)
        return err
    }
    // default: set gc.routed_to = target on the bead.
    return r.deps.Store.SetMetadata(req.BeadID, "gc.routed_to", req.Target)
}
```

So the `gc.routed_to` key is the **primary contract** between `sling`
and workers. Workers find their work by querying for it (see §3.5).

If the agent config defines `sling_query`, that shell command runs
instead of the metadata write. This is how gascity supports arbitrary
routing policies without hardcoding — the shell-out is the SDK's "pure
config" escape hatch.

### 3.3 The `sling` package

`internal/sling/` contains the reusable routing logic:

- `sling.go` (717 lines) — core types:
  - `BeadQuerier` / `BeadChildQuerier` — minimal read interfaces
    (`sling.go:26-34`).
  - `SlingOpts` — user intent (`sling.go:38-55`).
  - `SlingDeps` — infrastructure wiring (store, runner, city context,
    resolvers, notifier) (`sling.go:98-119`).
  - `RouteRequest` — typed routing op (bead id, target, metadata,
    work dir, env) (`sling.go:89-95`).
- `sling_core.go` (941 lines) — the main orchestration:
  - `DoSling` (`sling_core.go:36-61`): preflight → formula dispatch.
    Formula dispatch fan-out (`sling_core.go:51-60`):
    1. `opts.IsFormula` → `slingFormula` (wisp instantiation).
    2. `opts.OnFormula` → `slingOnFormula` (attach to existing bead).
    3. `agent.EffectiveDefaultSlingFormula()` → `slingDefaultFormula`.
    4. else → `slingPlainBead` (raw routing).
- `sling_attachment.go` (401 lines) — wisp attach helpers.
- `sling_graph.go` (111 lines) — graph.v2 workflow launch support.

Batch mode (`cmd_sling.go:657-734`): when the target bead is a
**container** (`beads.IsContainerType`, typically `type: "convoy"`),
`DoSlingBatch` expands children and routes each in parallel. Falls back
to per-child wisps when a formula is attached.

### 3.4 Pool model

Agents can opt into **pooled scaling**. The TOML knobs (Agent struct
fields; `internal/config/config.go:1477+`):

- `max_active_sessions: int | null` — cap; `nil`/unset = unlimited,
  `-1` historically = unlimited, `0` = disabled (suspended).
- `min_active_sessions: int | null` — guaranteed floor (default `0`).
- `scale_check: string` — shell command returning the desired worker
  count (e.g., `bd ready --metadata-field gc.routed_to=mypool --count`).
- `pool_name: string` — canonical pool identity.
- `namepool: string | []string` — name generator for instances.
- `on_boot: string` / `on_death: string` — hooks on first spawn / last
  worker exit.

Per-tick desired-state computation lives in
`cmd/gc/build_desired_state.go`:

- `DesiredStateResult` (`build_desired_state.go:25-49`) aggregates
  desired session map, scale-check counts, assigned-work beads, named
  session demand, etc.
- `buildDesiredState` (`build_desired_state.go:150-167`) loads session
  beads, iterates `cfg.Agents`, collects `pendingPools`, then runs the
  scale checks in parallel bounded by `[daemon] probe_concurrency`
  (default 8 — see §9).

`pool.evaluatePool()` (`cmd/gc/pool.go:122-151`) runs the configured
`scale_check` with a 180-second timeout (`bdProbeTimeout`), parses the
output as an integer, clamps to `[min, max]`, and on error returns
`min` (honors the floor even in partial-outage scenarios). `scaleParams`
is `{Min, Max, Check}` (`pool.go:100-104`) — `Max=-1` means unlimited.

### 3.5 Worker name expansion

`discoverPoolInstances` (`cmd/gc/pool.go:398-448`) maps template →
concrete session instances:

- **Bounded pools** (`Max > 1`): static enumeration
  `{name}-1, {name}-2, …, {name}-{Max}`.
- **Unlimited pools** (`Max = -1` or nil): dynamic discovery — query
  the session provider for running sessions with the template's
  prefix, reverse-map their names to qualified names.

Session name transformation
(e.g., `cmd/gc/pool.go:404-447`):

```
Qualified agent:   "my-rig/worker-1"
Session name:      "gc--my-rig--worker-1--<template-hash>"
   ↓ reverse
Discovered pool instance:  "my-rig/worker-1"
```

Template hash is a digest of the agent config. A drift in config ⇒ a
new hash ⇒ the reconciler can detect a stale worker and plan
replacement. This is the operational backbone of `gc reload` config
drift handling (see §10 on convergence).

`deepCopyAgent` (`cmd/gc/pool.go:229-372`) clones the agent spec per
instance so mutations to one (e.g., `Name`, `PoolName`) don't leak.
`PoolName` is set to the template's `QualifiedName()` so work slung to
the pool routes correctly back to its template for scale-up logic.

Note from `AGENTS.md` at gascity root: *when adding any field to
`config.Agent`, also add to `AgentPatch`, `AgentOverride`, their apply
functions, and the `poolAgents` deep-copy in `cmd/gc/pool.go`. A
`TestAgentFieldSync` enforces the struct definitions; the apply/copy
functions must be checked by hand.*

### 3.6 Default work-query (how workers find work)

Each agent has an `EffectiveWorkQuery()` (`internal/config/config.go`)
returning the shell command workers run to pick up work. When the
agent doesn't define a custom one, the synthesized default follows a
three-tier fallback:

1. **In-progress** beads assigned to my identifiers (crash recovery):
   `bd list --status in_progress --assignee=<id> --json --limit=1`
   for each of `$GC_SESSION_ID`, `$GC_SESSION_NAME`, `$GC_ALIAS`.
2. **Ready + assigned** to me:
   `bd ready --assignee=<id> --json --limit=1` (same identifier list).
3. **Ready + unassigned, routed to my pool**:
   `bd ready --metadata-field gc.routed_to=<my-qualified-name>
    --unassigned --json --limit=1`.

So from the worker's perspective, `gc.routed_to` is the pool-queue
claim key — exactly what the pool worker prompt at the top of this
session directs workers to use.

### 3.7 `graphroute` — graph.v2 step routing

`internal/graphroute/graphroute.go` handles routing for workflows
built on gascity's graph.v2 contract (see §4). Key points:

- `GraphExecutionRouteMetaKey = "gc.execution_routed_to"`
  (`graphroute.go:19`).
- `GraphRouteBinding{QualifiedName, SessionName, DirectSessionID,
  MetadataOnly}` (`graphroute.go:37-46`).
- `GraphStepRouteTarget` (`graphroute.go:118-134`) — resolves the
  step's target from either its `Assignee` field or
  `Metadata["gc.run_target"]`, then variable-substitutes.
- `ApplyGraphRouteBinding` (`graphroute.go:137-149`) — writes either
  `gc.routed_to`+`step.Assignee` (standard pool routing) or, for
  direct session targeting, `DirectSessionID → step.Assignee` with no
  metadata.
- `IsControlDispatcherKind` — returns true for step kinds
  `check`, `fanout`, `retry-eval`, `scope-check`, `workflow-finalize`,
  `retry`, `ralph` (`graphroute.go:55-61`) — these are diverted to
  the control dispatcher agent.
- `AssignGraphStepRoute` — when diverting a control step, stamps the
  original execution agent onto `gc.execution_routed_to` before
  writing `gc.routed_to = <control-dispatcher-agent>`
  (`graphroute.go:153-165`).

The "execution_routed_to" stamp is a structurally important audit
trail: it lets inspectors see what **would** have run the step if
control dispatch hadn't intercepted it.

### 3.8 Spawning: who actually runs tmux?

No hardcoded tmux / cloudcli invocation lives in Go. The path is:

1. The controller's **reconciler loop** builds a
   `DesiredStateResult` each tick.
2. It diffs desired against running; for each missing session it calls
   `session.Manager.Start`.
3. `session.Manager` delegates to the **`runtime.Provider`** for the
   agent's provider family.
4. The provider (tmux / acp / cloudcli / k8s / exec / hybrid / fake)
   materializes the session — `tmux new-session -d -s <name> <cmd>`,
   `cloudcli session start …`, etc.
5. `internal/worker/handle_lifecycle.go` is the bridge: `Start`,
   `StartResolved`, `Create`, `Attach`, `Stop`, `Kill`, `Close`, `State`
   (`handle_lifecycle.go:13-246`) wrap provider-specific operations
   behind a single `SessionHandle`.

This layering is what makes "no role hardcoded" hold: the binary has
no `if provider == "tmux" { tmux.Start() }` at call sites — dispatch
goes through `runtime.Provider`.

### 3.9 cloudcli startup quirk

Operator note: from my memory,
`cloudcli` startup_timeout bug fo-xzndi: `Start()` on a cloudcli provider
blocks on the initial-turn SSE stream, and the default `startup_timeout
= 60s` kills sessions before Claude can respond. Workaround: set
`[session] startup_timeout = "5m"` in this city's `city.toml`. Not a
gascity code bug per se — it's a consequence of the provider interface
taking `Start()` as an **initial-turn-inclusive** call rather than just
"process launched".

---

## 4. Formulas — TOML workflow templates

### 4.1 Where formulas live

Default search order (`internal/formula/parser.go:60-79`, with layer
overlays from `internal/config/config.go` `FormulaLayers` —
`config.go:374-396`):

1. `.beads/formulas` (project-level).
2. `~/.beads/formulas` (user-level).
3. `$GT_ROOT/.beads/formulas` (orchestrator-level, env-injected).
4. Plus city- and rig-level `formula_dirs` from `city.toml` ([formulas]
   section and per-pack `formulas/` subdirs).

Layer resolution: late entries shadow earlier ones by filename
(`FormulaLayers.City` and `FormulaLayers.Rigs[rig]` — last-wins per
layer).

### 4.2 Formula schema

`internal/formula/types.go:62-126` defines `Formula`:

```go
type Formula struct {
    Name, Description, Version, Contract, Type, Extends string
    Vars     map[string]*VarDef
    Steps    []*Step
    Template []*Step           // for type = "expansion"
    Compose  *ComposeRules
    Advice   []*AdviceRule
    Pointcuts []*Pointcut
    Phase    string   // "liquid" (persistent) or "vapor" (ephemeral wisp)
    Pour     bool     // persist every step as a child bead
    Source   string   // path loaded from
}
```

- `Contract = "graph.v2"` opts into the graph-first semantics (control
  beads, scope checks, fanout, workflow-finalize). If omitted, legacy
  pour/linear semantics are used (`types.go:80-82`,
  `requiresExplicitGraphContract` `types.go:882+`).
- `Type` ∈ `{"workflow", "expansion", "aspect"}`
  (`types.go:38-54`).
- `Phase = "vapor"` marks the formula as a **wisp**-generating formula
  — only the root bead persists, everything else is ephemeral
  (`types.go:113-122`, see §5).

`Step` (`types.go:197-304`) carries: `id, title, description,
description_file, type, priority, labels, metadata, depends_on / needs,
waits_for, assignee, expand, expand_vars, condition, children, gate,
loop, on_complete, ralph, retry, timeout`.

- `description_file` — path to a file whose contents substitute into
  the step's description at compile time (`types.go:211-212`).
- `children` — nested steps enable hierarchical structure inside a
  single formula.
- `gate` — async wait condition; step blocks until the gate closes
  externally.
- `loop` — iteration spec (`count`, `until`, `range`).
- `on_complete` — runtime fan-out; re-evaluated after the step closes
  (graph.v2-only).
- `ralph` and `retry` — inline run/check and transient-retry patterns
  expanded into control + iteration beads.

`VarDef` (`types.go:129-194`) supports `description, default, required,
enum, pattern, type`. TOML allows both shorthand string defaults and
full table syntax.

### 4.3 Compilation pipeline

`internal/formula/compile.go:31-163` — 13 stages, in order:

| Stage | Function                         | Purpose                                                      |
|-------|----------------------------------|--------------------------------------------------------------|
| 1     | `LoadByName`                     | Discover formula file by name via search paths               |
| 2     | `Resolve`                        | Resolve `extends` inheritance chain                          |
| 3     | `ApplyControlFlow`               | Expand `loop`, `branch`, `gate` into step sequences          |
| 4     | `ApplyAdvice`                    | Apply `before / after / around` advice                       |
| 5     | `ApplyInlineExpansions`          | Expand step-level `expand`                                   |
| 6     | `ApplyExpansions`                | Apply `compose.expand` and `compose.map`                     |
| 7     | Load + apply aspects             | From `compose.aspects` list                                  |
| 8     | `FilterStepsByCondition`         | Compile-time filtering on `condition` field                  |
| 9     | `MaterializeExpansion`           | For type=`expansion` formulas only                            |
| 10    | `ApplyRetries`                   | Inline retry → control + attempt beads                       |
| 11    | `ApplyRalph`                     | Inline ralph → control + run/check iterations                |
| 12    | `ApplyGraphControls`             | Inject fanout / scope-check / workflow-finalize (graph.v2)   |
| 13    | `toRecipe`                       | Flatten to `Recipe`                                          |

Compilation is **deterministic and variable-deferred**: `{{var}}`
placeholders stay in titles/descriptions/metadata until instantiation
time. `recipe.go:9-40` defines `Recipe` (name, description, steps,
deps, vars, phase, pour, root_only). `Recipe.Steps[0]` is always the
root workflow bead (`recipe.go:39+`).

### 4.4 graph.v2 control beads

`internal/formula/graph.go:6-112` applies graph-first controls. For
contract `"graph.v2"`, the compiler injects:

- **fanout** (`gc.kind = "fanout"`) — manages `on_complete` runtime
  expansion (for-each bonding of new molecules onto a step's output).
- **scope-check** (`gc.kind = "scope-check"`) — finalizes a scoped
  execution block; outcome written to `gc.output_json`.
- **workflow-finalize** (`gc.kind = "workflow-finalize"`) — terminal
  bead that depends on all workflow sinks; the presence of this bead
  is `sourceworkflow.IsWorkflowRoot`'s `gc.formula_contract="graph.v2"`
  check's target.

These control beads are the reason the control-dispatcher agent exists
— they're not execution steps and don't want to eat pool slots of the
execution agents.

### 4.5 Formula test harness

`internal/formulatest/v2.go` exports `EnableV2ForTest()` — flips the
process-global `formula_v2` flag on during a test and restores on
cleanup. Documented as "callers must not use in parallel tests"
(`formulatest/v2.go:15+`).

---

## 5. Molecules, wisps, and fragments

### 5.1 What a molecule is

`internal/molecule/molecule.go` instantiates a compiled `Recipe` into
real beads. The root is a bead of `type = "molecule"` (or `"wisp"`,
see below); each step is a child bead with dependency wiring preserved
from `Recipe.Deps`.

Public API:

- `Cook(ctx, store, formulaName, searchPaths, opts) (*Result, error)`
  (`molecule.go:125`): compile-by-name + instantiate.
- `CookOn(ctx, store, formulaName, searchPaths, opts) (*Result, error)`
  (`molecule.go:139`): like `Cook` but attaches to an existing bead
  (sets `ParentID` on the root, blocks attach bead on sub-DAG root).
- `Instantiate(ctx, store, recipe, opts) (*Result, error)`
  (`molecule.go:357`): instantiate a pre-compiled `Recipe`.
- `InstantiateFragment` (`molecule.go:562`): grafting helper for
  runtime DAG expansion (e.g., `on_complete` fanout).
- `Attach(ctx, store, recipe, attachBeadID, opts) (*AttachResult, error)`
  (`molecule.go:213`): late-bind DAG expansion — an agent can expand a
  bead into a sub-workflow at runtime; `opts.IdempotencyKey` prevents
  duplicates; `ErrEpochConflict` (`molecule.go:172`) reports optimistic
  concurrency violations; `ExpectedEpoch` guards against stale bases.

### 5.2 `Options`

`molecule.go:22-53`:

- `Title` — override root bead title (otherwise derived from formula).
- `Vars` — variable substitution values; formula defaults applied first.
- `ParentID` — attach molecule to an existing bead.
- `IdempotencyKey` — stored as `gc.idempotency_key` metadata to prevent
  duplicate wisps on crash-retry.
- `PriorityOverride` — force all beads to the same priority.
- `PreserveRootType` — skip the default "coerce root to type=molecule"
  behavior (useful for wisps which want `type=wisp`).
- `DeferAssignees` — create unassigned beads, stash intended assignee
  in `gc.deferred_assignee` metadata (for speculative creation).

### 5.3 Wisps

Wisps are **ephemeral molecules** generated in vapor phase:

- `Formula.Phase == "vapor"` (`types.go:113-122`) is the hint.
- The root bead gets `type = "wisp"` (unless `PreserveRootType`
  suppresses the coercion — `molecule.go:787+` `stepToBead` does the
  mapping).
- Wisps are tied to a source bead via `gc.continuation_group` metadata.
  Convergence (§10) pours a wisp per iteration of a patrol-style loop;
  closed wisps are garbage-collected by the daemon config
  `wisp_gc_interval` + `wisp_ttl`.
- `IdempotencyKey` prevents a convergence loop's crash-retry from
  pouring two wisps for the same group.

From my memory notes: wisps are "ephemeral molecules per continuation
group" — exactly what this documentation confirms.

### 5.4 `gc mol current` (the formula-step workflow the pool worker sees)

The pool worker prompt at the top of this session directs workers to
run `bd mol current <mol-id>` and work each `[ready]` step in order.
That command is a **beads-side** mol command (see
[02-cli-surface.md](02-cli-surface.md)). gascity does not reimplement
`bd mol`; it consumes its output. The division is:

- **gascity** compiles formulas and creates molecules (via
  `molecule.Cook` + `GraphApplyPlan`).
- **beads** tracks step status and exposes the step-at-a-time workflow
  via `bd mol current`.

This also means a "molecule" in bead-type terms has both gascity-owned
metadata (`gc.*`) and beads-owned step relationships (parent/child +
dependencies).

---

## 6. Convoys, orders, source workflows

### 6.1 Convoys

A **convoy** is a container bead grouping related work.
`internal/convoy/convoy.go` exposes (with types from
`convoy.go:12-34` and ops from `:43-148`):

- `ConvoyCreate(deps, store, input) (ConvoyCreateResult, error)` — creates
  the convoy bead, applies metadata (fields + labels), links children,
  emits a `ConvoyCreated` event.
- `ConvoyProgress(_, store, id) (ConvoyProgressResult, error)` —
  counts total/closed children, reports when all closed.
- `ConvoyAddItems(_, store, convoyID, items) error` — link more beads.
- `ConvoyClose(deps, store, id) error` — close convoy + emit
  `ConvoyClosed`.

The `gc convoy` CLI (`cmd/gc/cmd_convoy.go`,
`cmd/gc/cmd_convoy_dispatch.go`) adds operational subcommands: `list`,
`status`, `add`, `close`, `check`, `stranded`, `autoclose`, `land`,
`control --serve` (controller daemon for convoy state transitions).

When sling routes a **container bead**
(`IsContainerType("convoy")` — `beads.go:63-64`), `DoSlingBatch`
expands children and routes each one (§3.3).

### 6.2 Orders

`internal/orders/order.go:14-52` defines `Order`:

```go
type Order struct {
    Name, Description           string
    Formula, Exec               string   // mutually exclusive
    Trigger                     string   // "cooldown" | "cron" | "condition" | "event" | "manual"
    Interval, Schedule, Check   string
    On                          string   // event type
    Pool                        string   // target agent/pool
    Timeout                     string
    Enabled                     bool
    Source, FormulaLayer, Rig   string
}
```

Discovery: `orders/scanner.go:34-94` scans `orders/` subdirectories
across each formula layer; higher-priority layers override lower-ones
by order name; disabled and skip-listed orders are excluded.

Validation (`order.go:141-187`):

- Exactly one of `formula` or `exec`.
- Exec orders can't have a pool.
- Trigger-specific required fields: `cooldown → interval`,
  `cron → schedule`, `condition → check`, `event → on`,
  `manual → none`.
- Timeout parses as a Go duration.

Scoping (`order.go:56-61`): `ScopedName()` returns `<name>` for
city-level orders and `<name>:rig:<rig-name>` for rig-level ones.

The `gc order` CLI: `list`, `show`, `run`, `check`, `history`
(`cmd/gc/cmd_order.go`). Execution is driven by the controller daemon's
order loop.

### 6.3 Source workflows

`internal/sourceworkflow/sourceworkflow.go` enforces the invariant
**"one live graph workflow per source bead"**. A *source bead* is the
triggering issue (a user-filed bug, say); a *workflow root* is the
top-level bead of a graph.v2 workflow spawned from it.

Key pieces:

- `IsWorkflowRoot(bead)` (`sourceworkflow.go:49`) — `gc.kind="workflow"`
  OR `gc.formula_contract="graph.v2"`.
- `SourceStoreRefMetadataKey = "gc.source_store_ref"`
  (`sourceworkflow.go:42`) — value is `city:foo` or `rig:alpha`, so
  singleton checks cross store scopes correctly.
- `ConflictError{SourceBeadID, WorkflowIDs}` — returned when a launch
  is blocked by already-live workflow roots.
- `ListLiveRoots(store, sourceBeadID, sourceStoreRef)`
  (`sourceworkflow.go:110-133`) — indexed query on
  `gc.source_bead_id`.

Locking (`sourceworkflow.go:161-199`):

- `WithLock(ctx, ...)` acquires an in-process mutex + on-disk flock
  keyed by `sha256(scopeRef||sourceBeadID)`, at
  `<cityPath>/.gc/sling-source-locks/<hash>.lock`
  (`sourceworkflow.go:266`).
- Guarantees at-most-one concurrent launch/recovery per
  (scopeRef, sourceBeadID) across controller processes.
- Both mutex and flock waits honor `ctx` cancellation.

Subtree ops (`sourceworkflow.go:300-450`):

- `ListWorkflowBeads` — root + all descendants with
  `gc.root_bead_id = rootID`.
- `CloseWorkflowSubtree` — closes all open descendants, marks
  `gc.outcome = "skipped"`.
- `SnapshotOpenWorkflowBeads` + `RestoreWorkflowBeads` — snapshot /
  restore for rollback if a force-replacement fails.

---

## 7. `bd` hooks as the write-side event bus

gascity uses beads's hook system (`bd hooks` — see
[02-cli-surface.md](02-cli-surface.md)) as its primary external-write
invalidation path:

1. An agent runs `bd update ...` directly (no gascity involvement).
2. bd's write-side hook fires `gc event emit bead.updated <payload>`.
3. The controller's event bus routes the event.
4. `CachingStore.ApplyEvent("bead.updated", payload)`
   (`caching_store_events.go:15-53`) updates the cache.

Hooks are installed during `gc init` (and idempotently re-installed by
`gc reload` / startup) into each agent's working directory.
`internal/hooks/hooks.go:104-130`:

- `Install(fs, cityDir, workDir, providers)` — idempotent; never
  overwrites.
- `InstallWithResolver(..., familyResolver)` — supports provider
  aliases (e.g., an agent with `provider = "my-fast-claude"` that
  wraps `builtin:claude` gets Claude hooks).

Supported provider families (`hooks.go:28-31`): `claude`, `codex`,
`gemini`, `opencode`, `copilot`, `cursor`, `pi`, `omp`. Explicitly
unsupported (for now): `amp`, `auggie`.

The hook files are embedded at build time from
`internal/bootstrap/packs/core` and installed either at city-wide
(`.claude/`) or per-agent (`overlay/per-provider/<provider>/…`)
locations depending on the family (`hooks.go:118-121`).

---

## 8. Mail and nudge queue

### 8.1 Mail: beads with `type = "message"`

`internal/mail/mail.go:38-80` defines the `mail.Provider` interface.
The default backend is **beadmail**
(`internal/mail/beadmail/beadmail.go`, 370 lines) — messages are real
beads with `Type = "message"`. Alternative backends: `fake`, `fail`,
`exec:<script>` (config: `[mail] provider = "..."`).

`beadmail.Send(from, to, subject, body) (mail.Message, error)`
(`beadmail.go:30-57`):

```go
threadID := generateThreadID()
labels   := []string{"thread:" + threadID}
title    := subject   // or first line of body if subject is empty, 80-char cap

b, err := p.store.Create(beads.Bead{
    Title:       title,
    Description: body,
    Type:        "message",
    Assignee:    to,
    From:        from,
    Labels:      labels,
})
```

So `gc mail send mayor --notify -s "…" -m "…"` (as the pool worker
prompt uses) creates a bead of `type = "message"` assigned to mayor.
The inbox query is `ListByAssignee("mayor", "open", limit)` filtered
by the absence of a `"read"` label (`beadmail.go:60-61`, `filter
helpers :100+`).

`MarkRead(id)` adds the `"read"` label (`beadmail.go:94-100`). `Archive`
closes the bead. `Reply(id, from, subject, body)` creates a new
message bead that inherits the thread-id and sets `ReplyTo = id`.
`Thread(threadID)` returns all messages sharing the thread label,
ordered by time.

Importantly: the message ID **is** a bead ID. `bd show <id>` on a
message id shows the same bead; `bd close <id>` closes the message.
That's how gascity's mail lives natively in beads without inventing a
parallel table.

### 8.2 Nudges are not mail

Nudges are fundamentally different from mail — see
[03-concepts.md](03-concepts.md). Mail is a persisted message bead;
a nudge is a **prompt injection** directed at a live runtime
(tmux send-keys, ACP input, etc.). `gc session nudge <session>` does
not write a bead — it pokes the provider.

### 8.3 `nudgequeue` — deferred nudges

`internal/nudgequeue/state.go` (146 lines) persists nudges that can't
fire yet — because the target session isn't live, or is draining, or
hasn't reached a safe boundary. Schema (`state.go:18-50`):

```go
type Item struct {
    ID                string
    BeadID            string     // originating bead (if any)
    Agent             string     // target agent
    SessionID         string     // optional: specific session
    ContinuationEpoch string     // for fencing stale sessions
    Source            string     // "user" | "controller" | "bead" | ...
    Message           string
    Reference         *Reference
    CreatedAt         time.Time
    DeliverAfter      time.Time
    ExpiresAt         time.Time
    Attempts          int
    LastAttemptAt     time.Time
    LastError         string
    ClaimedAt, LeaseUntil time.Time  // claim lease for crash recovery
    DeadAt            time.Time      // moved to dead queue
}

type State struct {
    Pending, InFlight, Dead []Item
}
```

Persistence: JSON at `<city>/.gc/runtime/nudges/state.json` with
`state.lock` via fcntl `LOCK_EX` (`state.go:139-146`).
`WithState(cityPath, fn)` loads + mutates + atomically writes
(`state.go:83-136`). Items are sorted deterministically within each
bucket (`state.go:53-81`).

The reconciler is what actually delivers — it checks the queue after
session transitions and only delivers when target is `StateActive`,
`DeliverAfter` has passed, and the `ContinuationEpoch` still matches.
`LeaseUntil` covers crash recovery: a claimed but not-acked nudge gets
re-claimable once the lease expires.

---

## 9. Config, packs, overlays, Dolt auth

### 9.1 `city.toml` top-level sections

From `internal/config/config.go:117-287` (the `City` struct):

| Section                | Type                          | Role                                                                 |
|------------------------|-------------------------------|----------------------------------------------------------------------|
| `[workspace]`          | `Workspace`                   | Name, prefix, hooks, default rig includes, import style              |
| `[providers]`          | `map[string]ProviderSpec`     | Named provider presets                                               |
| `[imports]`            | `map[string]Import`           | V2 remote pack imports                                               |
| `[[agent]]`            | `[]Agent`                     | Agent templates                                                      |
| `[[named_session]]`    | `[]NamedSession`              | Canonical persistent sessions                                        |
| `[[rigs]]`             | `[]Rig`                       | External project registrations                                       |
| `[patches]`            | `Patches`                     | Per-agent modifications                                              |
| `[beads]`              | `BeadsConfig`                 | Bead store backend (`bd`, `file`, `exec:<script>`)                   |
| `[session]`            | `SessionConfig`               | Session provider + timeouts                                          |
| `[mail]`               | `MailConfig`                  | Mail backend (`beadmail` default)                                    |
| `[events]`             | `EventsConfig`                | Event log backend                                                    |
| `[dolt]`               | `DoltConfig`                  | Dolt host/port overrides                                             |
| `[formulas]`           | `FormulasConfig`              | `dir` for formulas                                                   |
| `[daemon]`             | `DaemonConfig`                | Patrol intervals, restart policy, probe concurrency                  |
| `[orders]`             | `OrdersConfig`                | Skips, overrides, max timeout                                        |
| `[api]`                | `APIConfig`                   | Dashboard HTTP+SSE API                                               |
| `[chat_sessions]`      | `ChatSessionsConfig`          | Auto-suspend policy for chat                                         |
| `[session_sleep]`      | `SessionSleepConfig`          | Idle-sleep durations                                                 |
| `[convergence]`        | `ConvergenceConfig`           | Max active loops (per-agent + total)                                 |
| `[[service]]`          | `[]Service`                   | HTTP services (city-scoped packs only)                               |
| `[agent_defaults]`     | `AgentDefaults`               | Shared agent config                                                  |

Internal fields (not in TOML — marked `toml:"-"`): `LoadWarnings`,
`ResolvedWorkspaceName/Prefix`, `FormulaLayers`, `PackDirs`,
`RigPackDirs`, `PackOverlayDirs`, `PackCommands`, `PackDoctors`,
`PackSkills`, `ResolvedProviders`, etc. These are the derived output
of the pack-expansion pipeline (§9.3) and drive runtime behavior.

### 9.2 `[session]` specifics

From `config.go:833-873`:

- `provider` — `"fake" | "fail" | "subprocess" | "acp" | "exec:<script>" | "k8s" | ""`
  (default tmux).
- `setup_timeout` — default `"10s"` (pre_start / session_setup).
- `nudge_ready_timeout` — default `"10s"`.
- `nudge_retry_interval` — default `"500ms"`.
- `nudge_lock_timeout` — default `"30s"`.
- `debounce_ms` — send-keys debounce, default 500.
- `display_ms` — status message display, default 5000.
- `startup_timeout` — `Start()` timeout, default `"60s"`. **The
  operator note: the `gc-chost.home.cwa.lv` city overrides this to
  "5m" because cloudcli `Start()` blocks on the initial SSE turn,
  which is slower than 60s** (memory note / `gc-chost-city-deviations.md`).
- `socket` — tmux socket name (defaults to city name).
- `acp` — sub-struct: handshake_timeout, nudge_busy_timeout,
  output_buffer_lines.

### 9.3 Pack composition

`internal/config/compose.go` and `internal/config/pack.go` compose the
effective config from multiple sources. Precedence (low → high):

```
Hardcoded defaults
  ↓
Pack.toml [pack] section (definition layer)
  ↓
City-level V1 includes (workspace.includes)
  ↓
City-level V2 imports ([imports])
  ↓
Rig packs (per rig)
  ↓
City.toml [[agent]] (deployment layer overrides)
  ↓
Rig patches (rig.patches/rig.overrides)
```

`ExpandPacks` in `config/pack.go` (specifically
`expandCityPacks:436-800` and per-rig `expandPacks:69-429`) drives
this. V2 imports stamp each included agent with a binding-qualified
name (e.g., `my-binding.my-agent`), so two packs can define an agent
called `claude` without colliding.

Derived paths surface in `City.FormulaLayers` (§4.1) and
`City.PackDirs` (ordered by precedence, low → high) —
`config.go:190-215`.

### 9.4 `gc init` — bootstrap

`cmd/gc/cmd_init.go:776-904`:

1. Fail if `.gc/` scaffold already exists and city.toml is absent.
2. `ensureCityScaffoldFS` creates `.gc/`, `.gc/cache/`, `.gc/system/packs/`.
3. `ensureInitConventionDirs` creates `agents/`, `formulas/`, `prompts/`,
   `orders/`, `hooks/`.
4. Install Claude Code hooks via `hooks.Install`
   (idempotent; writes `.claude/settings.json`).
5. Build initial config from template: `DefaultCity` (minimal),
   `WizardCity` (single agent + provider), or `GastownCity` (full Gas
   Town with mayor/deacon/polecat).
6. Write prompt scaffolds for declared agents (from embedded
   `defaultPrompts`).
7. Resolve formula files into `formulas/`.
8. Split the composed config: pack content to `pack.toml`, deployment
   content to `city.toml`.
9. Persist workspace identity to `.gc/identity.toml` (name + prefix).
10. Write `.gitignore` including `.gc/`, `.*swp`, `.env`.
11. If `[beads].provider = "file"`, create `.beads/.env` + `.gc/beads.json`.

Resulting disk shape:

```
<city>/
  city.toml
  pack.toml
  .gc/
    identity.toml
    events.jsonl
    beads.json          # file-provider only
    system/packs/       # city-scoped packs
    cache/packs/        # remote-pack cache
    tmp/                # graph-apply plans, other temp
    sling-source-locks/ # §6.3 flocks
    runtime/
      nudges/
        state.json
        state.lock
  .beads/               # (if using bd) dolt data dir; bd-managed
  .claude/              # Claude Code settings
  agents/
    <name>/prompt.template.md
  formulas/
  orders/
  hooks/
```

### 9.5 `gc reload`

`cmd/gc/cmd_reload.go:60-157`. What it reloads: re-fetches remote
packs, recomposes the effective config, runs the convergence loop for
config-drift, restarts sessions whose templates changed enough to
trigger the drift policy. What it **doesn't**: restart running
sessions that haven't drifted, restart the controller, or touch the
bead store.

Protocol (`cmd_reload.go:166-188`): the CLI sends `"reload:<JSON>"`
over the controller's Unix socket; the controller replies with
`outcome ∈ {applied, no_change, accepted, failed, busy, timeout}`.
Default is sync with a 5-minute wait; `--async` returns after
acceptance.

### 9.6 Dolt auth

`internal/doltauth/auth.go:34-81`. Resolution order for
`(user, password)` given `scopeRoot` + `host:port`:

1. **Env overrides** (highest): `GC_DOLT_USER`, `GC_DOLT_PASSWORD`,
   `GC_DOLT_HOST`, `GC_DOLT_PORT`.
2. **Scope-local**: `<scopeRoot>/.beads/.env`, shell-style key=value
   (supports bash export/quoting).
3. **Global credentials file**: `$BEADS_CREDENTIALS_FILE` env
   override, else `~/.config/beads/credentials` (Unix) /
   `%APPDATA%\beads\credentials` (Windows). INI-style `[host:port]`
   sections with `password = ...` entries.
4. **Fallback**: `fallbackUser` parameter (typically OS username).

The `.beads/.env` file is what `gc init` creates for file-provider
setups (empty password), but for bd/Dolt provider setups it's the
place operators drop secrets. It's intentionally scope-local so each
rig can have its own credentials without leaking into the outer city.

---

## 10. Convergence, supervisor, runtime

### 10.1 Convergence — the reconciler

`internal/convergence/reconcile.go:12-102` owns startup recovery and
the convergence state machine. Cases handled:

- **Empty / missing state** → pour a fresh wisp or adopt an existing
  one.
- **Creating** → terminate incomplete bead creation.
- **Terminated but not closed** → emit termination event + close bead.
- **Waiting manual** → check for stop request; if present, complete
  terminal transition.
- **Active** → no action.

Recovery outcomes (`reconcile.go:12-25`): `completed_terminal`,
`adopted_wisp`, `poured_wisp`, `repaired_state`, `no_action`.

The `Handler` loop advances beads through their state machine on a
tick driven by `daemon.patrol_interval` (default `"30s"` —
§9.1). Guardrails from `ConvergenceConfig`:

- `max_per_agent` (default 2) — cap on active convergence loops per
  agent.
- `max_total` (default 10) — global cap.

Event emission on state transitions: `wisp_poured`, `wisp_closed`,
`convergence_terminated`, etc. These feed the event bus (§11).

The reconciler is **also** the author of the gotcha documented in my
memory notes: when a worker completes phase 1 of a two-phase bead and
drains, the claim is cleared and the bead re-appears in its routed
pool if still open. Fix options (from the note): mayor pours phase 2
quickly; bead routing metadata gets updated off the worker pool; or
the worker drains with `bd defer` / a phase-2-pending tag. Without
one, workers loop re-verifying + re-mailing mayor indefinitely.

### 10.2 Supervisor — machine-wide registry

`internal/supervisor/registry.go:50-100+` persists a
machine-wide registry at `~/.gc/cities.toml` with file-level locking.

Core types (`registry.go:25-42`):

```go
type CityEntry struct { Path, Name string }
type RigEntry  struct { Path, Name, DefaultCity string }
```

Operations: `List`, `Register(cityPath, effectiveName)` — enforces
unique names, validates name shape (regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`).

This is separate from the city-local reconciler: the supervisor knows
**which cities exist on this machine**, while the reconciler runs
**inside one city** advancing its beads. A machine can host many
cities; only one reconciler runs per city.

### 10.3 Runtime — provider interface

`internal/runtime/runtime.go:98-194` defines the `Provider` interface.
Key methods: `Start(ctx, name, cfg)`, `Stop(name)`,
`Nudge(name, content)`, `SetMeta(name, key, value)` /
`GetMeta(name, key)`, `Peek(name, lines)`, `ListRunning(prefix)`.

Implementations:

- `runtime/tmux/` — default; `tmux new-session -d -s <name>`, meta
  via `tmux set-env`.
- `runtime/acp/` — Agent Client Protocol, JSON-RPC over stdio.
- `runtime/k8s/` — pod runtime.
- `runtime/exec/` — arbitrary subprocess.
- `runtime/hybrid/` — composed providers.
- `runtime/fake.go` — test double with spy capabilities.

### 10.4 Worker — transcript normalization

`internal/worker/` is **not** a running process — it's a structured
adapter that reads provider-native session logs (Claude `.jsonl`,
Codex rollouts) and normalizes them. Output types
(`worker/types.go:167-205`):

- `HistorySnapshot{GenerationID, Cursor, Continuity, TailState, Entries}`
- `HistoryEntry{ID, Kind, Actor, Status, Blocks}`
- `HistoryBlock{Type, Text, ToolUseID, …}` — types are `text`,
  `tool_use`, `tool_result`, `interaction`, `thinking`, `image`.

Call path from the controller:
`handle_lifecycle.go` operations (Start/Stop/Kill/…) →
`runtime.Provider` materializes → worker adapter tails the log file →
controller decides next action based on `TailState.Activity` (`in_turn`
vs idle), `PendingInteractions`, etc.

The separation matters: `worker` is the **observation** layer;
`runtime.Provider` is the **control** layer. `events` (§11) is the
**infrastructure** layer.

---

## 11. Events, activity, sessionlog

### 11.1 Events — infrastructure observation

`internal/events/events.go`. Tier-0 infrastructure log:

- Location: `.gc/events.jsonl`.
- Format (`events.go:83-91`):

```go
type Event struct {
    Seq     uint64
    Type    string
    Ts      time.Time
    Actor   string
    Subject string
    Message string
    Payload json.RawMessage
}
```

- Known types (`events.go:18-80`): session lifecycle
  (`SessionWoke/Stopped/Crashed/Draining/Undrained/Quarantined/
  IdleKilled/Suspended/Updated`), bead ops
  (`BeadCreated/Closed/Updated`), mail
  (`MailSent/Read/Archived/MarkedRead/MarkedUnread/Replied/Deleted`),
  convoy (`ConvoyCreated/Closed`), controller
  (`ControllerStarted/Stopped`), city (`CitySuspended/Resumed`),
  orders (`OrderFired/Completed/Failed`), worker (`WorkerOperation`),
  extmsg (`ExtMsgBound/Unbound/…`), provider (`ProviderSwapped`).

Invariants from gascity `AGENTS.md`: every constant in
`events.KnownEventTypes` must have a registered payload via
`events.RegisterPayload(constant, sample)`. `events.NoPayload` is used
when envelope fields alone capture semantics. Enforced by
`TestEveryKnownEventTypeHasRegisteredPayload`.

### 11.2 Activity / sessionlog — transcript observation

`internal/sessionlog/` reads provider-native session transcripts **in
place** — it does not duplicate them in an events log. Sources:

- Claude: `~/.claude/projects/<slug>/<id>.jsonl` (DAG by
  `parentUuid`).
- Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (flat list).

Types (`sessionlog/entry.go:26-127`):

- `Entry{UUID, ParentUUID, Type, Subtype, Message, ToolUseID,
  Timestamp, SessionID, RawJSON, …}`.
- `MessageContent{Role, Content (string or []ContentBlock)}`.
- `ContentBlock{Type, ID, Text, ToolUseID, Input, Content, IsError,
  Interaction, …}`.

DAG resolution: for Claude, reconstructs the active branch by
following `parentUuid` links, bridging across `compact_boundary`
system messages (context compaction). Subtypes include `init`,
`status`, `compact_boundary`.

Rough analogy:

```
Events   = kube events (pod started, pvc created, oom-killed)
Activity = kube logs   (pod stdout/stderr, agent messages)
Sessionlog = raw provider transcript (pre-normalization)
```

### 11.3 `gc trace` — the operator microscope

`gc trace` (not a subpackage but a cmd wiring — referenced in
gascity's contributor docs at
`engdocs/contributors/reconciler-debugging.md`) is the tool to pair
with `internal/events/` for incident diagnosis. It ties
`events.jsonl` entries to session-specific sessionlog windows.

---

## 12. Session lifecycle — states, drain, restart

### 12.1 States

From `internal/session/manager.go:25-51`:

| State            | Pool slot? | Notes                                                            |
|------------------|------------|------------------------------------------------------------------|
| `active`         | yes        | Live runtime.                                                    |
| `asleep`         | no         | Dormant, no runtime.                                             |
| `suspended`      | no         | Paused, no runtime.                                              |
| `creating`       | yes        | Bead written, runtime not yet confirmed alive.                   |
| `draining`       | yes        | Gracefully stopping, routing label removed.                      |
| `drained`        | no         | Acknowledged drain, waits for explicit wake reason.              |
| `awake`          | yes (=active) | Written by reconciler during asleep→running transition.       |
| `archived`       | no         | Drained + retained for history.                                  |
| `quarantined`    | yes        | Hit crash-loop threshold; temporarily blocked from waking.       |

`BeadType = "session"`, `LabelSession = "gc:session"`
(`manager.go:53-57`). `Info` struct (`manager.go:60-78`) carries the
user-facing view.

### 12.2 Drain commands

`cmd/gc/cmd_runtime_drain.go`. The `drainOps` interface
(`cmd_runtime_drain.go:16-30`) abstracts the metadata I/O for
testability — `setDrain`, `clearDrain`, `isDraining`,
`drainStartTime`, `setDrainAck`, `isDrainAcked`, `setRestartRequested`,
`isRestartRequested`, `clearRestartRequested`, `setDriftRestart`,
`isDriftRestart`, `clearDriftRestart`. `providerDrainOps`
(`cmd_runtime_drain.go:33-130`) implements it on top of
`runtime.Provider.SetMeta / GetMeta / RemoveMeta`.

Commands:

- **`gc runtime drain <name>`** (`cmd_runtime_drain.go:136-196`) — sets
  `GC_DRAIN=<unix-ts>` on the session's runtime metadata; routing
  labels removed so no new work routes in.
- **`gc runtime undrain <name>`** — clears `GC_DRAIN`, `GC_DRAIN_ACK`,
  and reconciler source/reason/generation keys
  (`providerDrainOps.clearDrain:41-49`).
- **`gc runtime drain-check [name]`** — reads `GC_DRAIN`; exit 0 if
  draining, 1 if not. Designed for agent-side shell conditionals.
- **`gc runtime drain-ack [name]`** — the agent says "I'm done; stop
  me". `setDrainAck` (`:74-81`) sets:
  - `GC_DRAIN_ACK = "1"`
  - `reconcilerDrainAckSourceKey = "agent"`
  - clears `reconcilerDrainAckReasonKey` + `…GenerationKey`.
  The reconciler sees it on the next tick, calls `runtime.Stop`, emits
  `SessionStopped` with message "drain acknowledged by agent".
- **`gc runtime request-restart`** (`:366-463`) — agent says
  "restart me fresh". Sets `GC_RESTART_REQUESTED=<unix-ts>`, then
  blocks forever (prevents more context consumption). Controller kills
  + restarts on next tick. For named sessions the restart is skipped —
  those are user-attended.

The pool worker prompt at the top of this session ends with
`gc runtime drain-ack` as the mandatory final action. The reason: only
when the worker sets that flag does the controller know it's safe to
free the pool slot.

### 12.3 Session reconciler

`cmd/gc/session_reconciler.go` (not in internal/ — it's at the cmd
level because it coordinates cross-package state) runs on controller
ticks. Responsibilities:

1. Diff desired vs running sessions (from `buildDesiredState`).
2. Apply state transitions (wake/sleep/drain/archive/quarantine).
3. Deliver nudges to live sessions.
4. Check drain-ack: on true, stop the session, remove routing label.
5. Check restart-requested: on true, kill + respawn.
6. Check drift: when template hash no longer matches, initiate
   drift-triggered drain.

---

## 13. Routing metadata catalog

Every `gc.*` metadata key gascity sets or consumes (discovered across
the subsystems above):

| Key                              | Written by                       | Consumed by                     |
|----------------------------------|----------------------------------|---------------------------------|
| `gc.routed_to`                   | `sling` router                   | worker's `work_query` tier 3    |
| `gc.execution_routed_to`         | `graphroute` on control divert   | auditors, tracing               |
| `gc.continuation_group`          | molecule layer (wisps)           | convergence loop                |
| `gc.kind`                        | formula compile (graph.v2)       | graphroute, reconciler          |
| `gc.parent`                      | molecule / formula               | hierarchy queries               |
| `gc.root_bead_id`                | sourceworkflow, formula compile  | subtree ops, singleton checks   |
| `gc.scope_ref`                   | dispatch / control               | scope-check, singleton          |
| `gc.scope_role`                  | formula metadata                 | scope-check                     |
| `gc.scope_name`                  | formula metadata                 | scope-check                     |
| `gc.control_for`                 | graph control injection          | control dispatcher              |
| `gc.fanout_state`                | dispatch/runtime                 | fanout state machine            |
| `gc.for_each`, `gc.bond`, `gc.bond_vars`, `gc.fanout_mode` | formula compile | fanout processor |
| `gc.on_fail`                     | formula scope metadata           | scope-check                     |
| `gc.source_bead_id`              | sourceworkflow launch            | `ListLiveRoots`                 |
| `gc.source_store_ref`            | sourceworkflow launch            | cross-store singleton           |
| `gc.formula_contract`            | formula compile (graph.v2)       | `IsWorkflowRoot`                |
| `gc.run_target`                  | formula metadata                 | `GraphStepRouteTarget`          |
| `gc.output_json`                 | scope-check bead                 | downstream scope tests          |
| `gc.output_json_required`        | formula with on_complete         | fanout output parsing           |
| `gc.outcome`                     | control beads, scope-check       | tracing, auditors               |
| `gc.idempotency_key`             | molecule.Options                 | molecule duplicate prevention   |
| `gc.deferred_assignee`, `…routed_to`, `…execution_routed_to`, `…type` | molecule `DeferAssignees` mode | reconciler reveal phase |
| `molecule_id`                    | sling (wisp attach)              | pool worker startup protocol    |

The pool worker prompt at the top of this session tells workers to
check `METADATA` for `molecule_id` to decide between "follow molecule
steps" and "just execute the description". That key is written by
sling attachment logic.

---

## 14. Gaps, contradictions, TODO markers

This section captures places where **docs and code disagree**, where
**gascity's use bends beads semantics**, and where **code TODOs hint
at unfinished regions**.

### 14.1 Mail-vs-beads semantic layering

`internal/mail/mail.go:80` says the package delivers
`mail.Provider`, with beadmail as the default backend. In practice,
beadmail **is** just a thin view over the bead store — a message
isn't a separate thing; it's a bead of `type = "message"` with
`Assignee = recipient`, `From = sender`, and labels that encode
thread/read state.

This means that every mail operation (`Send`, `Read`, `Archive`,
`Reply`) translates to bead CRUD. The pluggable `mail.Provider`
interface is a slight overkill: only beadmail, fake, fail, and an
exec-script backend exist. The exec variant re-derives messages from
nothing in particular, and has no obvious use case in the shipped
tree.

If beads-ui surfaces mail, it should surface "messages as a view over
beads of type=message" rather than "mail as an independent concept".
The `thread:<id>` label is the thread join key; the `read` label is
the read/unread toggle.

### 14.2 "Molecule" is ambiguous

Three meanings of "molecule" coexist:

1. **beads's `bd mol`** — the step-workflow runner (see
   [02-cli-surface.md](02-cli-surface.md)). Tracks `[done]` /
   `[current]` / `[ready]` / `[blocked]`.
2. **gascity's `molecule` bead type** — the root bead of an
   instantiated formula recipe (sets `ParentID` on children).
3. **gascity's "MEOW stack"** marketing term — the combined
   beads+formulas+molecules abstraction.

Beads-ui should disambiguate. Most user-facing uses want meaning #1
(what bd tracks) or #2 (a specific bead subtree in the store). The
abstract "molecule concept" meaning #3 is mostly a doc flourish.

### 14.3 `gc formula cook` vs `bd mol cook`

Both exist. `gc formula cook` (cmd_formula.go) compiles a formula in
gascity's compiler and instantiates the result via `molecule.Cook`
(either directly to the store, or atomically via `GraphApplyPlan`).
`bd mol cook` is the beads-side command.

Invocation path: `gc sling --formula` ultimately calls the **gascity**
compiler + `molecule.Cook`, not `bd mol cook`. So the compile is
gascity-native, but the resulting mol is navigable via `bd mol
current` / `bd mol progress` (because those operate on the bead
graph).

This means **if `bd` ever grows a real first-class formula engine,
there will be two parsers for the TOML format**. Keep an eye on
format drift.

### 14.4 Status model collapse

`BdStore` collapses bd's 6-status surface (open, in_progress, blocked,
review, testing, closed) down to gascity's 3 (open, in_progress,
closed) (`bdstore.go:389-398`). The gascity domain model declares
this explicitly at `beads.go:18`:

```go
Status string `json:"status"` // "open", "in_progress", "closed"
```

Implication: if a bead is set to `blocked`, `review`, or `testing` in
bd (via direct `bd update`), gascity reads it back as "in_progress" or
"open" depending on the mapping. The information is lossy on read.

If beads-ui surfaces the full status set, it must talk to `bd`
directly, not through gascity's `Store`.

### 14.5 `bd ready` exclusion list duplication

gascity duplicates bd's `GetReadyWork` exclusion list in
`beads.go:84-99`:

```go
var readyExcludeTypes = map[string]bool{
    "merge-request": true,
    "gate":          true,
    "molecule":      true,
    "message":       true,
    "session":       true,
    "agent":         true,
    "role":          true,
    "rig":           true,
}
```

With a comment: *"This matches the exclusion list in the bd CLI's
GetReadyWork query."* It **should** match. If bd changes its
exclusion list without gascity updating, results of `Ready()` on
`MemStore` / `FileStore` will disagree with `BdStore` (which just
shells out to `bd ready`).

No test enforces this invariant cross-repo as of this reading.

### 14.6 Wisp garbage collection vs daemon config

`daemon.wisp_gc_interval` + `daemon.wisp_ttl` are present in the
`DaemonConfig` fields, but the actual wisp-sweep implementation is
split between `internal/convergence/` and `internal/molecule/`. There
is no single function named "wisp gc" — the closing of idle wisps is
inlined into `Handler.reconcile`-style paths.

If beads-ui ever surfaces wisp lifecycle, the operator-visible concept
is "ephemeral molecule per continuation group", but the code spreads
the lifecycle across at least two packages.

### 14.7 `cacheDegraded` has no automatic recovery

`caching_store.go:48-49, 68-70`: after `maxCacheSyncFailures = 5`
consecutive sync failures, the cache state goes `cacheDegraded`. From
that state, reads fall back to the backing store. **There's no
automatic transition back to `cacheLive`** — the state machine
documented (`Uninitialized → Partial → Live → Degraded`) has no
`Degraded → Live` edge.

In practice the `cacheDegraded` cache is refreshed on the next
successful reconcile, but the flag is cleared implicitly. The
operator-visible effect: `CacheStats.State` may show `"degraded"`
while reads succeed — the field hasn't been re-set to `"live"`.

### 14.8 Source-workflow lock cleanup

`sourceworkflow.WithLock` creates flocks at
`<cityPath>/.gc/sling-source-locks/<hash>.lock`. The cleanup path (if
any) isn't in `sourceworkflow.go`; flock files accumulate unless the
outer `gc` process cleans them up explicitly. Not a correctness issue
(flocks are advisory and the lock file is harmless), but operators see
growing cruft in `.gc/sling-source-locks/` over a long-lived city's
lifetime.

### 14.9 The startup_timeout deviation is code-visible but not tested

The `[session] startup_timeout = "5m"` override documented in
`gc-chost-city-deviations.md` is necessary for cloudcli sessions to
succeed, but gascity itself doesn't encode this — the default is still
`"60s"` (`config.go:833-873`). There's no provider-family-aware
default.

A reasonable cleanup would be: if `[session] provider = "acp"` and the
transport is cloudcli (or generally: if the provider's `Start()`
blocks on initial-turn SSE), default `startup_timeout` higher. As of
this reading, the check is absent.

### 14.10 Metadata key proliferation

§13's table lists ~25 `gc.*` keys. There is no central registry of
"which key means what" — meanings are distributed across sling,
graphroute, sourceworkflow, molecule, convergence, formula compile.
A new key can be added anywhere.

If beads-ui wants to surface "all the routing/control signals on a
bead", that table is the authoritative catalog today; losing it is
easy because no Go constant file enumerates them. A future cleanup
would be a `package gcmeta` with exported constants and godoc.

### 14.11 Direct `bd` use bypasses `CachingStore`

Agents that run `bd` directly (not through gascity) write to Dolt but
don't inform `CachingStore` in-process. Invalidation relies on the bd
hook path (§7) → event bus → `ApplyEvent`. If the hook chain is
broken (e.g., `bd` invoked from a workdir without a `.beads/hooks`,
or with hooks disabled), the cache drifts until the next reconciler
tick (30s – 120s depending on cache size).

In practice cleanly installed cities have hooks from `gc init`; but a
hand-edited `city.toml`, or an agent running `bd` in a workdir that
isn't the scope root, can produce this drift. No operator-visible
warning flags this today.

### 14.12 Import style: V1 vs V2

`Workspace.ImportStyle` can select between V1 discovery
(`workspace.includes`) and V2 discovery (`[imports]`). The V1 path is
still fully supported in `config/pack.go`, but several recent features
(binding-qualified agents, shadow control, transitive toggles) are V2
only. Docs refer to both, sometimes interchangeably. Operators
migrating from V1 → V2 should expect pack-expansion behavior changes
around name collisions, specifically the stamp of `binding.agent`
onto included agent names.

---

## 15. Summary: what beads-ui should surface from gascity

Recommendations — to be revisited during the coherence audit
([README](README.md) "After the workers land"):

- **Beads first, orchestration second.** Gascity's concepts layer on
  bead metadata; teach the metadata, not the layer.
- **The `gc.routed_to` key is the single most load-bearing signal** in
  the system — it's the entire contract between dispatch and workers.
  Surface it prominently.
- **"Everything is a bead" is literally true.** Mail, sessions,
  agents, rigs, convoys, molecules, wisps — all are beads with
  specific `type` values and conventional metadata.
- **Molecules' step-at-a-time execution is a bd-side concept**
  (`bd mol current`). Gascity just creates the molecule; beads runs
  the workflow.
- **Orders, sourceworkflow, graph.v2 controls** are graph-v2 features
  (`gc.kind`, `gc.formula_contract`). They're safe to hide from a
  level-4 UI.
- **The exclusion list for "ready" work** determines what gets
  surfaced as actionable (§14.5). UIs should mirror the same
  exclusion list or explicitly show infrastructure beads separately.

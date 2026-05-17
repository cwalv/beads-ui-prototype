# 04 — Gastown's integration with beads

> **Scope:** How [gastown](https://github.com/steveyegge/gastown) consumes
> the `bd` (beads) issue tracker, and what concepts gastown layers on top.
> Companion to [01-data-model.md](01-data-model.md),
> [02-cli-surface.md](02-cli-surface.md), and
> [03-concepts.md](03-concepts.md). Where a beads concept (formula,
> molecule, convoy, mail, hook) appears in gastown under the same name,
> this doc describes gastown's implementation and calls out divergence
> from beads's own semantics.
>
> **Source-of-truth repo:** `github/gastownhall/gastown/`. All citations
> below are workspace-relative from that root.
>
> **Method:** code is authoritative. Docstrings and READMEs get flagged
> when they contradict the code.

## 1. How gastown uses beads: the one-page summary

### The headline finding

**gastown does not import beads as a Go package — it shells out to the
`bd` binary.** `grep -rn gastownhall/beads` across `gastown/**/*.go`
returns zero hits, and `gastown/go.mod` has no `github.com/gastownhall/beads`
entry. Everything goes through `exec.Command("bd", …)` at
`internal/beads/beads.go:437`, or through the in-process beadsdk Storage
interface when a caller wires one in via
`internal/beads/store.go:34` (`NewWithStore`).

This has consequences throughout the architecture:

- `internal/beads/` is not a thin shim. It's a ~5,000-line
  wrapper whose largest files are `beads.go` (1,693 lines),
  `fields.go` (1,057 lines), `beads_agent.go` (750 lines),
  `store.go` (599 lines), and `molecule.go` (579 lines) — each
  carrying distinct responsibilities.
- Most gastown concepts on top of beads are stored by embedding
  structured "key: value" lines in a bead's `description` text
  (`internal/beads/fields.go`). The schema lives in gastown, not in
  bd — new fields don't require a bd upgrade.
- Cross-rig routing is handled via `.beads/routes.jsonl`
  (`internal/beads/routes.go`) mapping prefix → database path.
  Worktrees use `.beads/redirect` files
  (`internal/beads/beads_redirect.go`) to share a single beads database
  across polecats, refinery, witness, and crew.

### The two-level beads architecture

Gastown uses **two scopes of beads database**, both served by one Dolt
SQL server per town on port 3307
(`docs/design/dolt-storage.md:21-35`):

| Level | Location | Prefix | Purpose |
|---|---|---|---|
| **Town** | `~/gt/.beads/` | `hq-*` | Cross-rig coordination, Mayor mail, agent identity |
| **Rig** | `<rig>/mayor/rig/.beads/` | project prefix (`gt-`, `bd-`, …) | Implementation work, MRs, project issues |

`docs/design/architecture.md:6-31` describes both levels. Routes.jsonl
lines look like:

```jsonl
{"prefix":"hq-","path":"."}
{"prefix":"gt-","path":"gastown/mayor/rig"}
```

When `bd show gt-xyz` runs, bd looks up `gt-` in routes.jsonl and
dispatches the query to the gastown rig's database
(`internal/beads/routes.go:14-22`).

### Agent-as-bead

Every long-lived agent is itself a bead
(`docs/design/architecture.md:33-58`):

| Agent | Scope | Bead ID format |
|---|---|---|
| Mayor | Town | `hq-mayor` |
| Deacon | Town | `hq-deacon` |
| Boot (deacon watchdog) | Town | `hq-boot` |
| Dogs | Town | `hq-dog-<name>` |
| Witness | Rig | `<prefix>-<rig>-witness` |
| Refinery | Rig | `<prefix>-<rig>-refinery` |
| Polecat | Rig | `<prefix>-<rig>-polecat-<name>` |
| Crew | Rig | `<prefix>-<rig>-crew-<name>` |

Agent beads carry lifecycle state: `agent_state`, `hook_bead` (what
work they're attached to), `role_bead` (pointer to the agent's role
template), plus per-role fields. See `internal/beads/beads_agent.go`
for `AgentFields` (line 36).

### The `gt` CLI

`cmd/gt/main.go` (12 lines) is a shim that calls
`internal/cmd.Execute()`. The real command tree lives in
`internal/cmd/` with **240 non-test `.go` files**. Many subcommands
simply shell out to `bd` via `BdCmd()` in `internal/cmd/bd_helpers.go`,
which builds commands with the right env vars (`BD_DOLT_AUTO_COMMIT`,
`BEADS_DIR`, `GT_ROOT`) and working dir.

### Read this doc next to the beads repo

Concepts gastown borrows from beads (formula, molecule, convoy, mail,
hook, nudge) are documented in
[03-concepts.md](03-concepts.md). This doc focuses on where gastown's
implementation **extends or shadows** those primitives, plus the
concepts gastown adds of its own (agent/crew/polecat/mayor/deacon/
witness/refinery/dog, escalation, wasteland, seance, feed, scheduler).

---

## 2. How gastown talks to `bd`

### 2.1 The `Beads` wrapper

Everything routes through a single `*Beads` receiver defined in
`internal/beads/beads.go`. It has two execution paths:

- **Shell-out path** (default): `run()` at
  `internal/beads/beads.go:412` builds an `exec.Command("bd", args...)`.
- **In-process path** (opt-in): when a caller wires in a
  `beadsdk.Storage` via
  `internal/beads/store.go:34` (`NewWithStore`), CRUD methods check
  `b.store != nil` and dispatch directly to the SDK instead of spawning
  a subprocess.

The in-process path avoids ~600ms subprocess overhead per call and is
used by long-lived servers (daemon, dashboard). The shell-out path is
the default because it guarantees correctness: bd is the authoritative
implementation.

### 2.2 `run()` — the shell-out helper

`internal/beads/beads.go:412-483`:

```go
cmd := exec.Command("bd", fullArgs...) //nolint:gosec
util.SetDetachedProcessGroup(cmd)
cmd.Dir = b.workDir
cmd.Env = runEnv
cmd.Stdout = &stdout
cmd.Stderr = &stderr
err := cmd.Run()
```

Two preprocessing steps run before `run()` is called:

- **`InjectFlatForListJSON`** at `internal/beads/beads.go:117` — adds
  `--flat` to `bd list --json` (bd v0.59+ requires it for array output).
- **`MaybePrependAllowStaleWithEnv`** at
  `internal/beads/beads.go:107` — prepends `--allow-stale` if the bd
  binary supports it, letting bd return cached data when the Dolt
  server is mid-operation instead of blocking.

`--allow-stale` support is detected at runtime by running
`bd --allow-stale version` and checking stderr for "unknown flag"
(`internal/beads/beads.go:58`, `BdSupportsAllowStaleWithEnv`). The
result is cached per resolved bd path — tests can stub a different
path to reset the cache (`internal/beads/beads.go:44-49`,
`ResetBdAllowStaleCacheForTest`).

### 2.3 Environment isolation

`buildRunEnv` at `internal/beads/beads.go:574` constructs a curated
environment:

- Translates gastown's `GT_DOLT_HOST` and `GT_DOLT_PORT` into bd's
  equivalents `BEADS_DOLT_SERVER_HOST` and `BEADS_DOLT_PORT`
  (`internal/beads/beads.go:642`, `translateDoltPort`). Without this,
  bd defaults to `127.0.0.1` and silently fails on remote Dolt setups
  (`docs/design/dolt-storage.md:44-51`).
- `overrideDoltEnvFromBeadsDir` at `internal/beads/beads.go:672` reads
  authoritative connection data from the target beads directory's
  `dolt-server.port` file and `metadata.json`.

`runWithRouting` at `internal/beads/beads.go:490` is the same path
without forcing `BEADS_DIR`. It lets bd apply its own prefix routing
(from `routes.jsonl`) to pick the target database. Used for cross-rig
queries.

### 2.4 JSON parsing

Most commands use `--json`. Parsed by `json.Unmarshal` into the
`Issue` struct defined at `internal/beads/beads.go:166`. JSON-producing
commands and their parse sites:

| bd command | Parse site (internal/beads/beads.go) |
|---|---|
| `bd list --json` | 779-796 |
| `bd show --json` | 1093-1109 |
| `bd query --json` (ephemerals) | 834-849 |
| `bd ready --json` | 1017-1028 |
| `bd ready --mol --json` | 1042-1053 |
| `bd blocked --json` | 1178-1189 |
| `bd create --json` | 1242-1253 |
| `bd search --json` | 1345-1356 |
| `bd sql --json` | 936-973 (merge-requests only) |

Two parsing pitfalls the wrapper handles:

- **Non-JSON outputs** — `bd list` may emit `"No issues found."`
  instead of JSON when empty. `isJSONBytes` at
  `internal/beads/beads.go:786-788` checks for leading `[` or `{`.
- **Warning lines in stdout** — bd occasionally prints
  `warning: …` to stdout; `stripStdoutWarnings` at
  `internal/beads/beads.go:854-874` removes them before the JSON parse.

### 2.5 Error categorization

`wrapError` at `internal/beads/beads.go:528-566` classifies failures:

- **`ErrNotInstalled`** — returned on `exec.ErrNotFound` (bd missing
  from PATH).
- **`ErrNotFound`** — matched from stderr against the phrases
  "not found", "Issue not found", "no issue found".
- **Subprocess crash** — `isSubprocessCrash` at
  `internal/beads/beads.go:553-566` detects SIGSEGV, "nil pointer", or
  "panic:" in stderr and returns a more useful error.
- **Generic** — everything else wraps into `bd %s: %s`.

Comment at `internal/beads/beads.go:529` makes the design explicit:
gastown deliberately avoids parsing stderr to drive control flow.
Only `ErrNotInstalled` and `ErrNotFound` are matched; anything else
is transported to the caller (agent/log). This avoids coupling gastown
to bd's error-message formatting.

### 2.6 Caching strategy

There is **no general per-bead cache** in gastown — each `Show`,
`List`, `Ready` call shells out. This is deliberate: concurrent agents
all read/write the same Dolt server, and caching would produce
coherency bugs.

What *is* cached:

- **Custom types and statuses configuration**. Gastown extends bd's
  built-in types (adds `rig`, `queue`, `event`, etc.) via
  `bd config set types.custom=…`. Running this on every CLI invocation
  would waste ~200ms per call. Instead gastown uses a two-level cache:
  - **Process-local map** — `ensuredDirs` at
    `internal/beads/beads_types.go:28-33`, guarded by a mutex,
    skips bd for already-processed beads dirs within one `gt` invocation.
  - **Persistent sentinel files** — `.beads/.gt-types-configured` and
    `.beads/.gt-statuses-configured` at
    `internal/beads/beads_types.go:122` and `:205`, storing the
    comma-separated list last configured. On staleness (list changed),
    reconfigure runs and the sentinel is rewritten
    (`internal/beads/beads_types.go:118-129`). Enables gastown upgrades
    to propagate new types transparently.

- **`bd --allow-stale` capability detection**, per resolved bd binary
  path (see §2.2).

### 2.7 `Store` — the in-process alternative

`internal/beads/store.go:1-27` defines `Beads.store` as an optional
`beadsdk.Storage`. When non-nil, it replaces the subprocess for many
operations.

Store-backed methods (`internal/beads/store.go`):
- `storeList`, `storeShow`, `storeShowMultiple` (lines 222+)
- `storeCreate`, `storeUpdate`, `storeClose`
- `storeReady`, `storeReadyWithFilter`, `storeBlocked`
- `storeSearch`, `storeAddDependency`, `storeRemoveDependency`
- `storeAddLabel`, `storeRemoveLabel`, `storeGetLabels`
- Delegation metadata: `storeDelegationSet`, `storeDelegationClear`

Non-store methods (routing-aware queries, SQL, config ops, init,
stats) still shell out.

Type conversion happens in `sdkIssueToIssue` at
`internal/beads/store.go:82-138` — converts beadsdk `time.Time` →
`RFC3339 string`, SDK status/type enums → strings, and enriches
dependencies from the SDK's `Dependencies` slice.

Store operations use a 30s context deadline
(`internal/beads/store.go:77-80`, `storeCtx`) to prevent hanging on a
locked database.

### 2.8 Direct SQL (one exception)

`ListMergeRequests` at `internal/beads/beads.go:897-976` is the one
place gastown runs raw SQL — via `bd sql --json`:

```go
query := fmt.Sprintf(
    "SELECT w.id, w.title, w.description, ... FROM wisps w JOIN wisp_labels l ...",
    labelFilter, statusFilter)
sqlOut, sqlErr := b.run("sql", "--json", query)
```

Reason: merge-request beads are ephemeral (`wisps` table), and `bd
list` only searches the `issues` table. `bd query` could read wisps
but can't parse colons in label values. So gastown falls back to raw
SQL through bd's SQL interface. This is a workaround the comment
acknowledges (`internal/beads/beads.go:898-903`).

Nowhere does gastown open a MySQL connection to Dolt directly. All
database access channels through bd (subprocess or SDK).

### 2.9 Locking

`handoff.go:193-200` defines `lockBead`:

```go
func (b *Beads) lockBead(beadID string) (func(), error) {
    lockPath := filepath.Join(b.getResolvedBeadsDir(), "locks", beadID+".flock")
    return lock.FlockAcquire(lockPath)
}
```

Advisory locks (flock) per bead ID in `.beads/locks/<beadID>.flock`.
Used whenever gastown does read-modify-write on a bead description
(e.g., attach/detach molecule, update agent fields). Different beads
can be modified concurrently; same bead is serialized.

`beads_agent.go:23` has a similar `lockAgentBead` for agent field
updates.

---

## 3. Routes and redirects: how one Dolt server serves many rigs

### 3.1 routes.jsonl

`internal/beads/routes.go:15-20`:

```go
type Route struct {
    Prefix string `json:"prefix"` // "gt-", "nx-", etc.
    Path   string `json:"path"`   // relative to town root
}
```

Stored as JSONL (one route per line) at `<town-root>/.beads/routes.jsonl`.
Also reflected in the Dolt `routes` table so bd can resolve routes
without reading the file
(`docs/design/dolt-storage.md:149`).

Operations (all at `internal/beads/routes.go`):

- `LoadRoutes` (line 27) — parse routes.jsonl
- `AppendRoute` (line 61) — idempotent add/update by prefix
- `RemoveRoute` (line 95)
- `WriteRoutes` (line 117) — atomic rename (temp + rename)
- `GetPrefixForRig` (line 172) — reverse lookup: rig → prefix
- `ResolveRoutingTarget` at `internal/beads/beads_types.go:62` —
  prefix → resolved beads directory (follows redirects)

### 3.2 .beads/redirect

`docs/design/architecture.md:194-205`:

> Worktrees (polecats, refinery, crew) don't have their own beads
> databases. Instead, they use a `.beads/redirect` file that points to
> the canonical beads location:
>
> ```
> polecats/alpha/.beads/redirect → ../../mayor/rig/.beads
> refinery/rig/.beads/redirect   → ../../mayor/rig/.beads
> ```

`ResolveBeadsDir` at `internal/beads/beads_redirect.go:26` follows
the chain (depth limit applied), detects circular redirects
(`internal/beads/beads_redirect.go:57-64`), and removes broken chains.
Resolution priority: rig-level DB > town-level DB > mayor fallback
(`internal/beads/beads_redirect.go:188-220`).

`SetupRedirect` at `internal/beads/beads_redirect.go:302` cleans
runtime artifacts (`.lock`, `daemon.log`, stale `redirect`) before
writing a new one. `ComputeRedirectTarget` at line 162 is shared by
the installer and `gt doctor`.

The filesystem-level redirect has no effect on bd itself — all agents
in a rig connect to the same Dolt server and see the same tables.
Redirects exist because bd discovers the database via filesystem path
(`.beads/metadata.json`), and worktrees need to point at the rig's
canonical `.beads/` without duplicating the metadata.

---

## 4. Agent identity: one bead per long-lived agent

### 4.1 AgentFields

Defined at `internal/beads/beads_agent.go:36-59`:

```go
type AgentFields struct {
    RoleType          string // "polecat", "witness", ...
    Rig               string // "" for global (mayor/deacon); else rig name
    AgentState        string // "working", "idle", "nuked", ...
    HookBead          string // current work bead ID
    CleanupStatus     string
    ActiveMR          string // active merge-request bead
    NotificationLevel string // "verbose" | "normal" | "muted" (default "normal")
    Mode              string // execution mode
    ExitType          string
    MRID              string
    Branch            string
    MRFailed          bool
    PushFailed        bool
    CompletionTime    time.Time
    // ... and more completion metadata
}
```

Stored in the agent bead's `description` as `key: value` lines (see
§5). Some fields are mirrored into structured columns (see the Dolt
schema at `docs/design/dolt-storage.md:103-122`): `hook_bead`,
`role_bead`, `agent_state`.

`ResolveAgentState` at `internal/beads/beads_agent.go:618` prefers the
structured column and falls back to the description field for legacy
compatibility.

### 4.2 Lifecycle

- **Create**: `CreateAgentBead` at `internal/beads/beads_agent.go:206`
  issues `bd create --json --id=<prefix>-<rig>-<role>[-<name>]
  --type=task --labels=gt:agent`. Agent-as-task isn't a mistake — bd
  has no `agent` built-in type, and gastown adds `gt:agent` as a
  label-level discriminator. (Per-rig custom types like `rig` and
  `queue` *are* registered; see §2.6.)
- **Idempotent create-or-reopen**: `CreateOrReopenAgentBead` at line
  285 handles the common "agent was nuked, respawn" case — if a closed
  bead with the target ID exists, reopen it; if open, return it; if
  missing, create it.
- **Nuke (keep history)**: `ResetAgentBeadForReuse` at line 360 clears
  mutable fields and sets `agent_state=nuked`. The bead and its
  history remain. Reason comment references issue gt-14b8o.
- **Update**: `UpdateAgentState` (line 416) and
  `UpdateAgentDescriptionFields` (line 454) mutate description-embedded
  fields. `UpdateAgentDescriptionFields` does the full
  read-modify-write under a per-bead flock.
- **Query**: `GetAgentBead` (line 604), `ListAgentBeads` (line 628 —
  merges results from `issues` and `wisps` tables to catch ephemeral
  agent beads).
- **Completion metadata**: `UpdateAgentCompletion` at line 558 writes
  completion metadata atomically when polecats finish (`gt-x7t9`).

### 4.3 Role beads

Separate beads carry role *definition* content — the Markdown prompt
that gets rendered into an agent's session at prime time:

- `hq-mayor-role`, `hq-deacon-role`, `hq-witness-role`,
  `hq-refinery-role`, `hq-polecat-role`, `hq-crew-role`,
  `hq-dog-role`, `hq-boot-role`
  (`docs/design/architecture.md:48-58`).

Each agent bead's `role_bead` column points at its role bead. Role
bead content is mostly authored in embedded templates; see §7.

### 4.4 The "hook" bead: GUPP

An agent's `hook_bead` points at the one bead they're supposed to be
working on right now. The GUPP rule from
`docs/glossary.md:10-11`:

> **GUPP (Gas Town Universal Propulsion Principle)**:
> "If there is work on your Hook, YOU MUST RUN IT."

`gt sling <bead> <rig>` updates the target agent bead's `hook_bead`
field, kicks the agent's session (nudge), and the agent's priming
context pulls the hooked work. Crash recovery is similar: `gt prime`
inspects `hook_bead` and resumes.

---

## 5. The `beads_*.go` concept wrappers

`internal/beads/` contains 14 `beads_<concept>.go` files (plus tests).
Each models a gastown-specific concept. This section has one
subsection per file. The pattern most use is **label + key-value
description fields**; a few use metadata JSON instead.

### 5.1 `beads_agent.go` — agent lifecycle

Covered in §4. 750 lines. Key functions: `CreateAgentBead:206`,
`CreateOrReopenAgentBead:285`, `ResetAgentBeadForReuse:360`,
`UpdateAgentState:416`, `UpdateAgentDescriptionFields:454`,
`GetAgentBead:604`, `ListAgentBeads:628`, `GetAgentNotificationLevel:588`.

### 5.2 `beads_channel.go` — broadcast channels

Concept: named pub/sub streams for messaging between agents. Channels
live at town scope (`hq-channel-<name>` ID format).

Storage: `task` bead + `gt:channel` label. Subscribers, status,
retention policy in description via
`ChannelFields` at `internal/beads/beads_channel.go:16-24`.

Operations:
- `CreateChannelBead` (line 140)
- `GetChannelBead` (line 184) / `GetChannelByID` (line 204)
- `SubscribeToChannel` (line 238) / `UnsubscribeFromChannel` (line 261)
- `UpdateChannelSubscribers` (line 222) /
  `UpdateChannelRetention` (line 285)
- `ListChannelBeads` (line 330)
- `EnforceChannelRetention` (line 386) — prunes messages per
  retention policy (count-based and time-based)
- `PruneAllChannels` (line 459) — run as a Deacon patrol task;
  uses a 10% buffer over the retention limit (line 466).

Messages posted to a channel are separate beads with labels
`gt:message,channel:<name>` (query at line 402).

### 5.3 `beads_delegation.go` — work delegation

Concept: links a parent bead to a child subtask with credit-share
terms. Replaces the removed `bd slot` facility (v0.62+, comment at
line 54).

Storage: **metadata only**. The child bead's `metadata.delegated_from`
JSON field holds the delegation record; no delegation bead is created.

Types at `internal/beads/beads_delegation.go:17-50`:
- `Delegation{Parent, Child, DelegatedBy, DelegatedTo, Terms}`
- `DelegationTerms{Portion, Deadline, AcceptanceCriteria, CreditShare}`

Operations:
- `AddDelegation` (line 55) — `bd update --set-metadata …` plus a
  `blocks`-type dependency (child blocks parent) at line 79.
- `RemoveDelegation` (line 88)
- `GetDelegation` (line 111) — reads from metadata
- `ListDelegationsFrom` (line 153)

Dependency failures (cross-rig scenarios where the `blocks` edge
crosses prefixes) are warnings, not errors — metadata is the primary
artifact (`internal/beads/beads_delegation.go:81-82`).

### 5.4 `beads_dog.go` — infrastructure dogs

Concept: town-scoped infrastructure workers dispatched by Deacon for
maintenance (e.g., Boot, Compactor, Reaper).

Storage: same as agents — `task` + `gt:agent` label. Dogs are
distinguished by `role_type:dog` label. ID format `hq-dog-<name>` via
`DogBeadIDTown()` at `internal/beads/agent_ids.go:37`.

Operations at `internal/beads/beads_dog.go`:
- `CreateDogAgentBead` (line 13)
- `FindDogAgentBead` (line 56) — searches gt:agent beads for
  role_type:dog
- `ResetDogAgentBead` (line 87) — calls `ResetAgentBeadForReuse`

**Documentation/code mismatch**: the comment at
`internal/beads/beads_dog.go:11` says "Dogs use a different schema
than other agents — they use labels for metadata" but the code
creates standard `gt:agent` beads with extra labels. Dogs are agent
beads; the "different schema" claim is misleading.

### 5.5 `beads_escalation.go` — severity-routed incidents

Concept: alerts with severity (critical/high/medium/low), ack/resolve
lifecycle, re-escalation support.

Storage: `task` + `gt:escalation` label, **ephemeral**
(`--ephemeral --wisp-type=escalation` at line 175). Severity-labeled
(`severity:critical`) for indexed queries (line 181).

`EscalationFields` at `internal/beads/beads_escalation.go:15-30`:
Severity, Reason, Source, EscalatedBy, EscalatedAt, AckedBy, AckedAt,
ClosedBy, ClosedReason, RelatedBead + re-escalation tracking
(OriginalSeverity, ReescalationCount, LastReescalatedAt,
LastReescalatedBy).

Operations:
- `CreateEscalationBead` (line 163), `AckEscalation` (line 206),
  `CloseEscalation` (line 234), `GetEscalationBead` (line 269)
- `ListEscalations` (line 287), `ListEscalationsBySeverity` (line 302)
- `ListStaleEscalations(threshold)` (line 323) — unacked older than
  threshold, for patrol-driven re-escalation
- `ReescalateEscalation` (line 368) — bumps severity
  (low→medium→high→critical), records original severity on first bump
  (line 400-402), enforces a configurable max to prevent spam (line
  385-389). Result struct `ReescalationResult` at line 354.

### 5.6 `beads_group.go` — mail distribution groups

Concept: named collections of addresses (agents, channels, other
groups) for broadcast mail routing. Town-scoped.

Storage: `task` + `gt:group`. Name, Members, CreatedBy, CreatedAt in
`GroupFields` (line 39-46). ID `hq-group-<name>`.

Validation at lines 23-37: lowercase alphanumeric + hyphen/underscore,
max 64 chars, no leading/trailing whitespace.

Operations: `CreateGroupBead` (line 142), `GetGroupByName` (line
189), `GetGroupByID` (line 209), `UpdateGroupMembers` (line 227),
`AddGroupMember` (line 251 — checks for duplicates),
`RemoveGroupMember` (line 282), `ListGroupBeads` (line 321),
`LookupGroupByName` (line 346 — fallback scan by Name field).

Members can reference other group names, enabling recursive expansion
during mail distribution.

### 5.7 `beads_merge_slot.go` — per-rig merge mutex

Concept: a single bead per rig acting as a distributed mutex for
merge-queue conflict resolution. One bead holds `{holder, waiters}`
JSON. Replaces `bd merge-slot` (v0.62+, comment at line 8).

Types at `internal/beads/beads_merge_slot.go:19-32`:
`MergeSlotStatus{ID, Available, Holder, Waiters}`.

Operations:
- `MergeSlotCreate` (line 72), `MergeSlotEnsureExists` (line 206 —
  idempotent)
- `MergeSlotCheck` (line 87)
- `MergeSlotAcquire(holder, addWaiter)` (line 103) — **non-blocking**;
  returns current status. Waiters list is informational. Callers
  implement retry loops.
- `MergeSlotRelease(holder)` (line 167) — clears holder, promotes
  first waiter (line 185-191).

### 5.8 `beads_mr.go` — merge-request lookups

Concept: lookup helpers for merge-request beads. MR beads are created
by `gt done` and the refinery; this file is all read-side helpers.

Storage: wisps (ephemeral, commented at line 66).

Functions at `internal/beads/beads_mr.go`:
- `FindMRForBranch(branch)` (line 11) — first open MR for branch
- `FindMRForBranchAny(branch)` (line 18) — any status (for recovery)
- `FindMRForBranchAndSHA(branch, sha)` (line 29) — strict
  dedup key (GH#3032) — matches branch AND commit SHA
- `FindOpenMRsForIssue(issueID)` (line 93) — for supersession logic
- `MatchesMRSourceIssue(description, issueID)` (line 115) — needle
  match with trailing newline

Legacy fallback: if no SHA field on existing MRs, branch-only
(backward-compat).

### 5.9 `beads_queue.go` — claim-pattern queues

Concept: generic work queue with claim patterns (which agents can
claim from it) and concurrency limits.

Storage: custom type `queue` + `gt:queue` label. `QueueFields` at
`internal/beads/beads_queue.go:14-26`: Name, ClaimPattern (e.g.
`"gastown/polecats/*"`), Status (active/paused/closed), MaxConcurrency,
ProcessingOrder (fifo/priority), counts, CreatedBy, CreatedAt.

ID format: `hq-q-<name>` (town) or `<prefix>-q-<name>` (rig),
depending on the scope.

Operations: `CreateQueueBead` (line 170), `GetQueueBead` (line 207),
`UpdateQueueFields` (line 225), `UpdateQueueCounts` (line 237),
`UpdateQueueStatus` (line 255), `ListQueueBeads` (line 274),
`LookupQueueByName` (line 302).

Claim-pattern matching at `MatchClaimPattern` (line 337) supports
`"*"`, `"rig/role/*"`, and exact-match patterns. `FindEligibleQueues`
(line 373) returns queues that this identity can claim from.

Queue items are **separate beads** (not embedded) — the queue bead
tracks metadata and counts, not the work itself.

### 5.10 `beads_redirect.go` — worktree sharing

Covered in §3.2. 381 lines. `ResolveBeadsDir:26`, `SetupRedirect:302`,
`ComputeRedirectTarget:162`, `IsLocalBeadsDir:358`.

### 5.11 `beads_rig.go` — rig identity

Concept: per-repository metadata (git URL, beads prefix, operational
state).

Storage: custom type `rig` + `gt:rig` label. `RigFields` at
`internal/beads/beads_rig.go:32-37`: Repo, Prefix, State. `RigState`
enum at line 11-21: `Active`, `Archived`, `Maintenance`.

ID format: `<prefix>-rig-<name>` (e.g., `gt-rig-gastown`,
`bd-rig-beads`).

Operations:
- `EnsureRigBead` (line 100) — idempotent create-or-fetch; on create
  failure, retries `Show()` to handle Dolt races (line 113-121,
  `gt-d8681`).
- `CreateRigBead` (line 130) — requires custom types be registered
  first (line 148-150).
- `GetRigBead` (line 184), `GetRigByID` (line 204),
  `UpdateRigBead` (line 222), `DeleteRigBead` (line 245),
  `ListRigBeads` (line 252).

### 5.12 `beads_sling_context.go` — scheduler state

Concept: ephemeral bead tracking scheduler state (capacity reservation,
routing decisions) *without* modifying the work bead itself.

Storage: `task` + `capacity.LabelSlingContext` label (from
`internal/scheduler/capacity`). Description is **pure JSON** (not
key-value lines), because the scheduler fully owns these beads — no
user content to collide with (line 12-20).

`SlingContextFields` is defined in `internal/scheduler/capacity`;
this file has the persistence adapter.

Operations: `CreateSlingContext` (line 34), `FindOpenSlingContext`
(line 77 — idempotency), `ListOpenSlingContexts` (line 94),
`CloseSlingContext` (line 122 — suppresses "already closed"),
`UpdateSlingContextFields` (line 131).

The context bead has a `tracks`-type dependency on the work bead
(line 65). Cross-rig dependency failures are warnings (line 67-69).

### 5.13 `beads_types.go` — bd type/status registration

Concept: configure bd's custom-types and custom-statuses arrays for
a given `.beads/` directory.

Functions (all at `internal/beads/beads_types.go`):
- `FindTownRoot` (line 41) — walk upward finding outermost
  `mayor/town.json`.
- `ResolveRoutingTarget(townRoot, beadID, fallbackDir)` (line 62) —
  extract prefix, look up route, resolve beads dir. This is **the**
  routing helper used across the wrapper.
- `EnsureCustomTypes` (line 103) — configures types with the
  two-level cache described in §2.6 (sentinel file +
  `ensuredDirs`). Staleness detection at line 118-129.
  `VerifyAfterSet` re-reads via `bd config get` (line 163-170) to
  catch databases where `config set` silently wrote to the wrong db.
- `EnsureCustomStatuses` (line 187) — merges required statuses with
  existing ones; same caching pattern.
- `ensureDatabaseInitialized` (line 290-405) — creates a fresh bd
  database if missing. Handles Dolt server registration delay by
  retrying `bd migrate` once with 500ms backoff (line 382-402,
  `GH#1769`).
- `detectPrefix` (line 423-461) — town `rigs.json` → `config.yaml`
  → default `"gt"`.

**Known limitation** flagged at lines 415-422: when a beads dir is
accessed via a route, `filepath.Base` yields `"rig"` rather than the
actual rig name. This causes custom-prefix rigs accessed via routes
to silently get prefix `"gt"`. The comment acknowledges fixing this
would require walking the directory tree and is marked
out-of-scope.

### 5.14 `catalog.go` — molecule template registry

Concept: hierarchical read-only registry of molecule templates,
loaded from town / rig / project JSONL files. Not itself a bead.

Types at `internal/beads/catalog.go:15-32`:
- `CatalogMolecule{ID, Title, Description, Source}` where Source is
  `"town"` | `"rig"` | `"project"`
- `MoleculeCatalog{molecules, order}` — map + insertion order

Operations:
- `NewMoleculeCatalog` (line 35)
- `LoadCatalog(townRoot, rigPath, projectPath)` (line 50) — loads
  all three levels; later sources override earlier ones by ID.
  Respects `.beads/redirect`.
- `Add` (line 84), `Get` (line 92), `List` (line 97),
  `Count` (line 108)
- `LoadFromFile(path, source)` (line 115) — JSONL parser with
  line-number reporting on error (line 135)
- `SaveToFile` (line 152) — atomic (temp + rename)
- `ToIssue()` (line 189) — converts to `*Issue` for compatibility.

### 5.15 `audit.go` — detach/burn audit log

Concept: append-only JSONL log for attach/detach/burn/squash
operations on pinned beads (not stored in bd).

Types at `internal/beads/audit.go:12-27`:
`DetachAuditEntry{Timestamp, Operation, PinnedBeadID,
DetachedMolecule, DetachedBy, Reason, PreviousState}`.

Operations:
- `DetachMoleculeWithAudit(pinnedBeadID, opts)` (line 32) — acquires
  per-bead flock, captures prior state, logs, clears attachment.
- `LogDetachAudit(entry)` (line 86) — appends JSON+newline to
  `.beads/audit.log` with `Sync()` for durability.

Non-fatal: if audit write fails, detach still succeeds with a warning
(line 68).

### 5.16 Concept summary table

| Concept | File | Bead type + label | Storage mechanism |
|---|---|---|---|
| Agent | beads_agent.go | `task` + `gt:agent` | description fields + `hook_bead`/`role_bead`/`agent_state` columns |
| Channel | beads_channel.go | `task` + `gt:channel` | description fields |
| Delegation | beads_delegation.go | — (metadata only) | metadata.delegated_from on child bead + `blocks` dep |
| Dog | beads_dog.go | `task` + `gt:agent` + `role_type:dog` | same as agent |
| Escalation | beads_escalation.go | `task` + `gt:escalation` (ephemeral wisp) | description fields + severity labels |
| Group | beads_group.go | `task` + `gt:group` | description fields |
| Merge slot | beads_merge_slot.go | `task` + `gt:merge-slot` | description JSON `{holder, waiters}` |
| Merge request | beads_mr.go | wisp (ephemeral) | description fields (branch, sha, source) |
| Queue | beads_queue.go | `queue` + `gt:queue` | description fields + claim pattern |
| Redirect | beads_redirect.go | — (filesystem) | `.beads/redirect` text file |
| Rig | beads_rig.go | `rig` + `gt:rig` | description fields (repo, prefix, state) |
| Sling context | beads_sling_context.go | `task` + `sling:context` (ephemeral) | description JSON |
| Catalog | catalog.go | — (JSONL) | `molecules.jsonl` at town/rig/project |
| Audit | audit.go | — (JSONL) | `.beads/audit.log` |

`fields.go` (1,057 lines) is the parsing/formatting substrate for
all description-field concepts. See §6.

---

## 6. `fields.go` — the description-field substrate

`internal/beads/fields.go` is 1,057 lines. It models structured
metadata embedded as `key: value` lines in bead descriptions. This is
the substrate on which nearly every concept in §5 sits.

### 6.1 Why description fields instead of schema columns

Adding a new field means:
- No bd schema migration
- No coordination with the beads project
- No bd version bump required
- Round-tripping with human-authored content in the same description is preserved

The trade-off: parsing is fragile and lossy. Mitigations:
- Case-insensitive + hyphen/underscore-insensitive key matching
- Robust per-line parser (doesn't fail the whole bead on one bad line)
- Values are single-line strings; multi-line content still goes in
  free-form description prose

### 6.2 AttachmentFields — the pinned-bead slot

The prototype: what happens when gastown "attaches" a molecule of
work to a pinned agent bead. `internal/beads/fields.go:13-29`:

```go
type AttachmentFields struct {
    AttachedMolecule string
    AttachedFormula  string
    AttachedAt       string
    AttachedArgs     string
    AttachedVars     []string
    DispatchedBy     string
    NoMerge          bool
    ReviewOnly       bool
    Mode             string // "" | "ralph"
    ConvoyID         string // "hq-cv-abc"
    MergeStrategy    string // "direct" | "mr" | "local" | ""
    ConvoyOwned      bool
    FormulaVars      string
}
```

Parsing at `ParseAttachmentFields` (line 31-107):

```go
for _, line := range strings.Split(issue.Description, "\n") {
    colonIdx := strings.Index(line, ":")
    key := strings.TrimSpace(line[:colonIdx])
    value := strings.TrimSpace(line[colonIdx+1:])
    switch strings.ToLower(key) {
    case "attached_molecule", "attached-molecule", "attachedmolecule":
        fields.AttachedMolecule = value
    // …
    }
}
```

Formatting at `FormatAttachmentFields` (line 109+):

```go
lines = append(lines, "attached_molecule: "+fields.AttachedMolecule)
lines = append(lines, "attached_at: "+fields.AttachedAt)
// …
```

### 6.3 Other field types

`fields.go` also defines:
- `GetIntegrationBranchField` / `AddIntegrationBranchField` —
  per-epic integration-branch name stored on parent epic beads. Read
  by `DetectIntegrationBranch` (see §6.4).
- `GetBaseBranchField` / `AddBaseBranchField` — base-branch name for
  MR workflows.
- MR fields (parsed/formatted for `beads_mr.go`).

All follow the same key-value-line pattern.

### 6.4 Integration branches

`integration.go` (246 lines) reads fields from epic beads to determine
integration branch names. `DetectIntegrationBranch`
(`internal/beads/integration.go:187-246`) walks the parent chain up to
depth 10, looking for `integration_branch: …` on each epic. If
missing, it falls back to a template string
(`integration/{title}`, `integration/{epic}`, or
`integration/{prefix}/{user}`) with git config for `{user}`
(`internal/beads/integration.go:130-160`). Checks remote first
(authoritative), then local.

---

## 7. Orchestration concept packages

Gastown adds many concepts beyond what beads provides. This section
covers the concepts organized by scope and relationship to beads.

### 7.1 Agents: identity and per-role packages

#### 7.1.1 `internal/agent/` + `internal/agentlog/`

`internal/agent/state.go:15-62` defines a generic `StateManager[T]`
that serializes JSON state to `.runtime/<state-file>.json`. Used by
per-role agents to persist runtime state outside of beads.

`internal/agentlog/event.go:14-46` defines `AgentEvent` (session id,
type, token counts, etc.) and the `AgentAdapter` interface. Factory
`NewAdapter()` at line 50-59 supports `"claudecode"` and `"opencode"`
runtimes. Events become OTEL telemetry, not beads.

#### 7.1.2 `internal/polecat/`

`internal/polecat/manager.go` (100+ lines across many files) manages
polecat worker sessions. Entry: `Manager.Spawn()`. Session name
format `gt-<rig>-<polecat>`. Key helpers:

- `SetAgentStateWithRetry` — retries on Dolt optimistic-lock errors
  (`doltBackoff` at line 55, `isDoltOptimisticLockError` at line 75,
  `isDoltConfigError` at line 92).
- `internal/checkpoint/checkpoint.go:22-78` defines the `Checkpoint`
  struct (MoleculeID, CurrentStep, ModifiedFiles, HookedBead,
  SessionID). Written to `.polecat-checkpoint.json`.

Polecats interact with bd in two ways:
- They read their `hook_bead` and follow the attached molecule steps.
- They write completion metadata back via `UpdateAgentCompletion`
  (§4.2) and create merge-request beads via `gt done`.

#### 7.1.3 `internal/witness/`

`internal/witness/manager.go:34-100` defines per-rig witness. Methods:
`IsRunning`, `IsHealthy(maxInactivity)` → `tmux.ZombieStatus`,
`Status` → `tmux.SessionInfo`. Event handlers in `handlers.go`.

Witnesses don't create beads themselves; they observe polecats and
send `MERGE_READY` messages (see §7.4) to the refinery when work is
ready.

#### 7.1.4 `internal/refinery/`

`internal/refinery/engineer.go` runs the full merge lifecycle.
`GateConfig` at `internal/refinery/batch.go:20-100` parametrizes
quality gates (Cmd, Timeout, Phase with `GatePhasePreMerge` /
`GatePhasePostSquash`). `DefaultStaleClaimTimeout = 30*time.Minute`;
`isClaimStale` at `internal/refinery/engineer.go:58-67`.

Refinery creates/writes `merge-request` beads and manages the
batch-then-bisect merge queue
(`docs/design/architecture.md:206-237`).

#### 7.1.5 `internal/mayor/`

`internal/mayor/manager.go:47-100` exposes `Manager` with
`CombinedStatus() → MayorStatus{Active, Mode, ACPPid}`. Modes at
line 28-36: `ModeTMUX`, `ModeACP`, `ModeBoth`, `ModeNone`.

Mayor coordinates cross-rig work, holds exclusive write access during
merges, and manages the `mayor/rig` orchestration worktree. Does not
directly create beads — it routes work and observes state.

#### 7.1.6 `internal/deacon/`

`internal/deacon/manager.go:42-100` runs as a long-lived `hq`-prefixed
session. `heartbeat.go` (lines 5-120) implements cross-rig liveness
monitoring. `feed_stranded.go:12-140` feeds stranded issues back into
patrol queues. Does not directly write bead metadata — it reads,
observes, and dispatches.

#### 7.1.7 `internal/dog/`

`internal/dog/manager.go:30-100` manages a kennel at
`$TOWNROOT/deacon/dogs/`. `Add(name)` creates a new dog; state goes to
`.dog.json` with `.dog.lock` flock. `lockDog` serializes concurrent
spawn/remove.

Dog agent beads (`hq-dog-<name>`) are created via §5.4; this package
is the live-session side.

#### 7.1.8 `internal/crew/`

`internal/crew/types.go:6-40` defines `CrewWorker{Name, Rig,
ClonePath, Branch, CreatedAt, UpdatedAt}`. `Manager` at
`internal/crew/manager.go:1-120` provides `Add`, `Remove`, `Start`
with `StartOptions{Resume, Account, Topic}`.

Crew workers are human workspaces. Metadata persists in a local
`crew.json`, not beads (legacy JSONL inbox mode via
`internal/mail/mailbox.go:52-56`). Session lifecycle triggers nudge
poller (`internal/nudge/poller.go:51-54`).

### 7.2 Work tracking: convoy, formula, molecule

#### 7.2.1 `internal/convoy/`

Convoys are **work-tracking units**. A convoy bead has type `convoy`
(custom) and tracks a collection of child beads via `tracks`-type
dependencies.

`internal/convoy/operations.go:1-90`:
- `CheckConvoysForIssue(issueID)` — when a child closes, walk the
  tracking convoys and feed next-ready issues.
- `getTrackingConvoys(issueID)` — uses
  `store.GetDependentsWithMetadata()` filtered by type
  `"tracks"`.
- `isConvoyClosed()`, `isConvoyStaged()`.

`internal/convoy/multi_store.go:3-110` handles multi-database (town +
rig) convoy operations, because a convoy can span rigs.

Convoy status values use bd custom statuses: `staged_ready`,
`staged_warnings`, plus the standard lifecycle.

#### 7.2.2 `internal/formula/`

TOML-based workflow templates. `internal/formula/doc.go:1-128`
explains the four flavors: convoy (parallel legs + synthesis),
workflow (sequential), expansion (template step generation), aspect
(multi-aspect parallel).

Core operations:
- `ParseFile`, `TopologicalSort`, `ReadySteps(completed)` — standard
  DAG primitives.
- `internal/formula/embed.go:10-100` embeds built-in formulas at
  build time (release, security-audit, etc.).

**Formulas are NOT stored as beads** in gastown. They are Go-embedded
templates rendered into agent prompts at prime time, or checked into
`.formulas/` in a rig. Molecules (their instances) are beads.

`internal/formula/overlay.go` handles formula overlays for
town/rig-level step customization
(`docs/design/architecture.md:329-373`).

#### 7.2.3 `internal/molecule/` and the molecule wrapper

A molecule is a **workflow instance**. Gastown has two places molecules
are processed:

- `internal/beads/molecule.go:1-579` — the **wrapper** parses a
  molecule's step DAG out of a bead description. `MoleculeStep` at
  lines 14-24: `Ref, Title, Instructions, Needs, WaitsFor, Tier,
  Type, Backoff`. Regex-based parser at line 70+ reads the textual
  format:
  ```
  ## Step: <ref>
  <prose>
  Needs: <step>, <step>
  Tier: haiku|sonnet|opus
  Type: task|wait
  Backoff: base=30s, multiplier=2, max=10m
  ```
  Wait-type steps + exponential backoff support patrol agents
  cycling without consuming tokens.

- `internal/molecule/` — the runtime side: molecule instance state,
  pour vs root-only (see `docs/concepts/molecules.md`), step
  resolution.

Two modes documented at `docs/concepts/molecules.md:18-25`:

- **Root-only wisp** (default, `pour = false`) — steps read inline
  from embedded formula at prime time. Prevents wisp accumulation.
- **Poured** (`pour = true`) — steps materialize as sub-wisp beads
  with checkpoint recovery. Used for release-scale work.

### 7.3 Mail, nudge, channels, groups

#### 7.3.1 `internal/mail/`

Persistent agent-to-agent messaging. Two modes:

- **Legacy JSONL** — `internal/mail/mailbox.go:34-100` defines
  `Mailbox{identity, workDir, beadsDir, legacy}`. Crew can use JSONL
  inboxes for simplicity.
- **Beads-backed** — `NewMailboxBeads()` creates a mailbox that writes
  messages as `message`-type beads. Used by polecats, witness,
  refinery, deacon.

Helper layer in `internal/mail/bd.go:14-143`:
`runBdCommand` wraps bd calls with retry logic and timeouts
(60s for reads/writes at `bdReadCtx`/`bdWriteCtx`).

#### 7.3.2 `internal/nudge/`

Live message delivery via tmux send-keys — wakes a running agent
mid-session. Poller runs per session as a background `gt nudge-poller`
process; PID tracked in `.runtime/nudge_poller/<session>.pid`.

`internal/nudge/poller.go:40-80`: `StartPoller` launches the poller,
`pollerAlive` checks the PID file, `DefaultPollInterval = "10s"`,
`DefaultIdleTimeout = "3s"`.

Nudges are queued in memory; no beads involved. Crew session
lifecycle triggers poller start
(`internal/crew/manager.go`).

#### 7.3.3 Channels and groups

Channels (§5.2) and groups (§5.6) provide pub/sub and distribution
routing on top of mail.

### 7.4 Protocol

`internal/protocol/messages.go:11-75` defines typed messages passed
between agents over the mail bus:

- `NewMergeReadyMessage(MergeReadyPayload)` — witness → refinery
  signaling a polecat is done and branch is ready
- `NewMergedMessage(MergedPayload)` — refinery → witness confirming a
  merge

Types live here so both sides deserialize consistently.

### 7.5 Operational infrastructure

#### 7.5.1 `internal/hooks/` + `internal/hookutil/`

Manages `.claude/settings.json` per role. Hooks run on
`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`,
`UserPromptSubmit`, `WorktreeCreate`, `WorktreeRemove`.

- `internal/hooks/config.go:17-100` — `HooksConfig`, `Hook{Type, Command}`,
  `SettingsJSON` preserves unknown fields via an `Extra` map for
  round-trip safety.
- `internal/hookutil/roletype.go:15-22` — `IsAutonomousRole(role)`
  returns true for polecat/witness/refinery/deacon/boot, false for
  mayor/crew.

Hooks are NOT beads. They're files written to each agent's worktree.

#### 7.5.2 `internal/keepalive/`

Best-effort activity signaling. `internal/keepalive/keepalive.go:51-138`
defines `State{LastCommand, Timestamp}`, helpers
`Touch`/`TouchWithArgs`/`TouchInWorkspace`. `Age()` returns 365d on
missing file (sentinel for "agent is idle"). Filesystem only; no
beads.

#### 7.5.3 `internal/estop/`

Emergency-stop sentinel files at town (`ESTOP`) and rig
(`ESTOP.<rigname>`) levels. `internal/estop/estop.go:20-102`:
`Info{Trigger, Reason, Timestamp}`, `IsActive`, `Activate`,
`Deactivate`, `IsAnyActive(townRoot, rigName)`. Mayor is exempt (for
recovery). Checked by the daemon before spawning polecats.

#### 7.5.4 `internal/feed/`

Live activity curator. `internal/feed/curator.go:42-93`: reads
`.events.jsonl`, filters, deduplicates (5 molecule updates → "agent
active"), aggregates (3 issues closed → "batch"), writes to
`.feed.jsonl`. Loads config from town settings, uses `doneDedupeWindow`
and `slingAggregateWindow`.

No bead interaction — purely filesystem events.

#### 7.5.5 `internal/mq/`

Merge queue ID generator. `internal/mq/id.go:22-58` produces
`<prefix>-mr-<10-char-hash>` from SHA256 of branch + timestamp +
random bytes. Used by refinery and sling.

#### 7.5.6 `internal/activity/`

Dashboard color-coding for agent activity. `internal/activity/
activity.go:37-138` computes green (<5m) / yellow (5-10m) / red (>10m)
/ unknown. Purely in-memory.

#### 7.5.7 `internal/scheduler/capacity/`

Dispatch scheduler with two modes
(`docs/design/scheduler.md`):

- **Direct** (default, `MaxPolecats = -1`) — `gt sling` spawns
  immediately, near-zero overhead.
- **Deferred** (`MaxPolecats > 0`) — daemon dispatches incrementally
  under capacity, using bead labels to track pending dispatches.

`internal/scheduler/capacity/config.go:8-85`:
`SchedulerConfig{MaxPolecats, BatchSize, SpawnDelay}`.
`GetMaxPolecats`, `IsDeferred`, `DefaultSchedulerConfig` returns
`MaxPolecats = -1`.

Orchestration lives in `internal/cmd/scheduler.go` and
`scheduler_convoy.go`.

#### 7.5.8 `internal/krc/`

"Key Record Chronicle" — TTL management for Level 0 operational data
(patrol heartbeats, session events, operational noise). Auto-prunes
on daemon startup and periodically per configured TTLs.

`internal/krc/krc.go:30-85`: `Config{DefaultTTL, TTLs, PruneInterval,
MinRetainCount}`. Default TTLs: `patrol_*: 1d`, `mail: 30d`,
`merge_*: 30d`. Not beads-specific — manages `.events.jsonl`
lifecycle.

### 7.6 User-facing helpers

#### 7.6.1 Seance — `internal/cmd/seance.go`

Not a package — implemented directly as a cmd. Discovers prior
sessions from `.events.jsonl` (SessionStart hooks) and spawns
`claude --fork-session --resume <id>` for Q&A with predecessor
sessions.

`internal/cmd/seance.go:33-74`: `seanceCmd` with flags `--role`,
`--rig`, `--recent N`, `--talk <id>`, `--prompt`, `--json`.
`runSeanceList` lists sessions; `runSeanceTalk` spawns the subprocess.
Reads session metadata from events, not beads.

#### 7.6.2 Wasteland — `internal/wasteland/`

Federated work via DoltHub. Each rig has a sovereign fork with shared
commons as upstream.

`internal/wasteland/wasteland.go:29-95`: `Config{Upstream, ForkOrg,
ForkDB, LocalDir, RigHandle, JoinedAt}`, `LoadConfig`, `SaveConfig`,
`ParseUpstream`, `ForkDoltHubRepo`. Config at `mayor/wasteland.json`.
Uses DoltHub's API; not local beads.

#### 7.6.3 Proxy — `internal/proxy/` + `internal/protocol/`

mTLS CA for sandboxed polecat execution.
`internal/proxy/ca.go:22-100`: `CA{Cert, CertPEM, Key}`,
`GenerateCA`, `IssueServerCert`, `LoadCA`, `SaveCA`. ECDSA P256 keys.

#### 7.6.4 Templates — `internal/templates/`

Embedded role prompts and message templates.
`internal/templates/templates.go:52-100`: `Templates` holds
`roleTemplates` (Markdown + Go templates) and `messageTemplates`.
`RoleData` for role priming; `SpawnData`, `NudgeData`,
`EscalationData` for message rendering.

Templates are embedded via `//go:embed roles/*.md.tmpl` etc. Upgrading
the binary propagates template changes
(`docs/design/architecture.md:314-328`).

#### 7.6.5 Wisp — `internal/wisp/`

Local-only config not synced via git. `internal/wisp/config.go:29-90`:
`Config{mu, townRoot, rigName, filePath}`, `ConfigFile{Rig, Values,
Blocked}`. Storage at `.beads-wisp/config/<rig>.json`.

This is separate from the "wisp" concept in beads (ephemeral beads).
Gastown overloads the name for local KV storage.

---

## 8. The `gt` CLI surface

### 8.1 Command structure

`cmd/gt/main.go:1-12` is the 12-line main:

```go
package main

import (
    "os"
    "github.com/steveyegge/gastown/internal/cmd"
)

func main() {
    os.Exit(cmd.Execute())
}
```

The real command tree lives in `internal/cmd/` — **240 non-test .go
files**. Root command registration at `internal/cmd/root.go:25-31`;
command groups defined at `internal/cmd/root.go:336-344` (Work,
Agents, Communication, Services, Workspace, Configuration,
Diagnostics).

### 8.2 Key command families

**Beads shell-out delegates** — the `BdCmd()` builder at
`internal/cmd/bd_helpers.go:33-180` constructs bd commands with the
right env vars. Chainable methods: `WithAutoCommit()`,
`WithGTRoot(root)`, `WithBeadsDir(dir)`, `Dir(dir)`, `StripBeadsDir()`,
`Stderr(w)`. Terminals: `Run()`, `Output()`, `CombinedOutput()`,
`Build()`. Common pattern in sling:

```go
BdCmd("update", beadID, "--status=hooked", "--assignee="+agentID).
    WithAutoCommit().Run()
```

**`gt prime`** (context injection) — `internal/cmd/prime.go:58-96`
registers `primeCmd` at `prime.go:109`. Detects role (mayor/deacon/
polecat/witness/crew/dog) from the current directory, outputs
session context, optionally reads session ID from stdin JSON for
Claude Code hooks. Partners: `prime_molecule.go`, `prime_output.go`,
`prime_session.go` produce the rendered content.

**`gt sling`** (work dispatch) — `internal/cmd/sling.go:25-100`
registered at line 168. The main agent dispatch verb. Partner files:
`sling_batch.go`, `sling_convoy.go`, `sling_dispatch.go`,
`sling_dog.go`, `sling_formula.go`, `sling_helpers.go`,
`sling_idempotency.go`, `sling_schedule.go`, `sling_target.go`,
`sling_validate.go`. Writes the target's `hook_bead` and nudges.

**`gt convoy`** (multi-issue tracking) —
`internal/cmd/convoy.go:25-30` with subcommands registered at
lines 375-429: status, list, add, check, stranded, close, land,
launch, stage, watch. Many partner `convoy_*.go` files.

**`gt mail`** — `internal/cmd/mail.go:55-96`. Subcommands in
`mail_announce.go`, `mail_channel.go`, `mail_check.go`,
`mail_directory.go`, `mail_drain.go`, `mail_group.go`, `mail_hook.go`,
`mail_identity.go`, `mail_inbox.go`, `mail_queue.go`,
`mail_search.go`, `mail_send.go`, `mail_thread.go`.

**`gt hook`** — `internal/cmd/hook.go:22-52`, aliased to `work`.
Paired with a large family of `hooks_*.go` files
(`hooks_base.go`, `hooks_diff.go`, `hooks_init.go`,
`hooks_install.go`, `hooks_list.go`, `hooks_override.go`,
`hooks_registry.go`, `hooks_scan.go`, `hooks_sync.go`).

**`gt nudge`** — `internal/cmd/nudge.go:71-80`. Partner
`nudge_poller.go` runs as a background daemon.

**Agent lifecycle commands**:
- `gt mayor` — `internal/cmd/mayor.go:22-40`, registered at line 136.
  Subcommands: `start`, `stop`, `attach`, `status`.
- `gt deacon` — `internal/cmd/deacon.go:32-50`, registered at line 467.
- `gt witness` — `internal/cmd/witness.go:24-44`.
- `gt dog` — `internal/cmd/dog.go` — `add`, `list`, `call`, `done`,
  `status`.
- `gt polecat` — partners `polecat.go`, `polecat_cycle.go`,
  `polecat_helpers.go`, `polecat_identity.go`, `polecat_spawn.go`.

**`gt formula` / `gt molecule` / `gt mountain`**:
- `internal/cmd/formula.go:39-67` with `formula_overlay*.go`.
- `internal/cmd/molecule.go:15-43` registered at line 269.
  Many partners: `molecule_attach*.go`, `molecule_await_event.go`,
  `molecule_await_signal.go`, `molecule_dag.go`, `molecule_dep.go`,
  `molecule_emit_event.go`, `molecule_lifecycle.go`,
  `molecule_status.go`, `molecule_step.go`.
- `internal/cmd/mountain.go:21-48` — epic/convoy grinding.

**`gt done`** — `internal/cmd/done.go:31-60`. Polecat completion
transition to merge queue.

**`gt escalate`** — `internal/cmd/escalate.go:22-60`. With
`escalate_impl.go`. Severity-based routing (critical/high/medium/low)
through deacon/mayor/overseer.

**`gt seance`** — `internal/cmd/seance.go:33-74`. See §7.6.1.

**`gt feed`** — `internal/cmd/feed.go:45-81` registered at line 31.
BubbleTea TUI.

**`gt refinery`** — referenced in the root exempt list at
`internal/cmd/root.go:52`.

**`gt wl`** — wasteland federation. Partner files `wl_browse.go`,
`wl_charsheet.go`, `wl_claim.go`, `wl_done.go`, `wl_post.go`,
`wl_schema_evolution.go`, `wl_scorekeeper.go`, `wl_show.go`,
`wl_stamp.go`, `wl_stamps.go`, `wl_sync.go`.

**`gt dolt`** — dolt lifecycle: `dolt.go`, `dolt_flatten.go`,
`dolt_rebase.go`.

**`gt daemon`** — `daemon.go`, `daemon_reload_unix.go`,
`daemon_reload_windows.go`. Runs the town-level daemon managing Dolt
server + patrol cycles.

**`gt scheduler`** — status/pause/resume/clear, `scheduler.go`,
`scheduler_convoy.go`, `scheduler_epic.go`.

**Many more**: `gt patrol`, `gt tap`, `gt krc`, `gt checkpoint`,
`gt compact`, `gt reaper`, `gt doctor`, `gt plugin`, `gt
directive`, `gt install`, `gt release`, `gt dashboard`, `gt
statusline`, `gt handoff`, `gt resume`, `gt memories`, `gt
remember`, `gt forget`, `gt info`, `gt ready`, `gt commit`,
`gt changelog`, `gt role`, `gt theme`, `gt version`. Full list in
`internal/cmd/` — 240 files.

---

## 9. Deployment and configuration

### 9.1 Dockerfile

`Dockerfile` (github/gastownhall/gastown/Dockerfile:1-50):
- Base: `docker/sandbox-templates:claude-code`
- Installs Go 1.25.8 from tarball
- System deps: build-essential, git, sqlite3, tmux, curl, ripgrep, zsh,
  gh, netcat, vim
- Scripts install `bd` (beads) and `dolt`
- Build: `make build` inside container
- Output: `/app/gastown/gt` on PATH

### 9.2 Dockerfile.e2e

`Dockerfile.e2e:1-75`:
- Base: `golang:1.26-alpine`
- Pins `BD_VERSION=v0.57.0` and `DOLT_VERSION=1.82.4`, both built
  from source
- Workdir `/app` with workspace mount
- CMD runs `go test -tags=e2e -run TestInstall`

### 9.3 docker-compose.yml

`docker-compose.yml:1-45`:
- Single service `gastown`
- Volumes: agent-home, workspace (`/gt`), dolt-data (VirtioFS-safe
  ext4 volume — addressing a known macOS issue)
- Env: `IS_SANDBOX=1`, `GIT_USER`, `GIT_EMAIL`
- Ports: `DASHBOARD_PORT` (default 8080)
- Entry: `docker-entrypoint.sh`

### 9.4 docker-entrypoint.sh

`docker-entrypoint.sh:1-23`: sets git/dolt config from env vars,
runs `gt install /gt --git --force` to bootstrap the workspace,
passes control to CMD.

### 9.5 flake.nix

`flake.nix:1-68`: Nix flake packaging gastown as a Go binary.
Inputs: nixpkgs, flake-utils, and `beads` (from
`gastownhall/beads`). Build uses `buildGoModule` with ldflags setting
`Build=nix` and `BuiltProperly=1`. Dev shell includes beads,
go_1_25, gopls, go-tools.

Note: the flake imports beads as an input — but this is for
**installing the bd binary into the dev shell**, not for importing
beads as a Go package. The no-Go-import finding (§1) stands.

### 9.6 scripts/

Contents of `scripts/`:
- `bootstrap-local-rig.sh` — initialize a local rig
- `bump-version.sh` — version management
- `ci_state_classifier.py` — CI analysis
- `generate-newsletter.py` — changelog generation
- `gen_hanoi.py` — hanoi test formula generator
- `launch-migration-at.sh` — migration scheduler
- `run-hardener.sh` — sandbox hardening
- `test-gce-install.sh` — GCE deployment test
- `test-proxy-*.sh` — proxy server testing

### 9.7 Config loading

Config lives in a few places:

- **Town settings** — `internal/config/` with `loader.go:39-100`
  providing `LoadTownConfig` (line 40) and `LoadRigsConfig` (line 84).
- **Rig settings** — `internal/config/agents.go` (agent aliases),
  `internal/config/directives.go` (role directives).
- **Town overseer settings** — `internal/config/overseer.go`.

Directives and formula overlays at town/rig scope
(`docs/design/architecture.md:329-373`):

- `~/gt/directives/<role>.md` — town-level role directives
  (LoadRoleDirective in `internal/config/directives.go`).
- `~/gt/formula-overlays/<formula>.toml` — town-level step overrides
  (`internal/formula/overlay.go`, `LoadFormulaOverlay`, `ApplyOverlays`).
- Rig-level equivalents take full precedence (not merged) over town.

Override modes: `replace`, `append`, `skip`
(`docs/design/architecture.md:362-366`).

---

## 10. Plugins, npm-package, gt-model-eval, templates

### 10.1 Plugin system

**Status: proposed, not yet implemented in full**
(`docs/design/plugin-system.md:1-277`, dated 2026-01-11).

Design:
- Discovery: `~/gt/plugins/` (town-level) and `<rig>/plugins/`
  (rig-level).
- Execution: dogs dispatch and execute plugins non-blocking on
  Deacon's patrol loop.
- State: plugin runs stored as wisps (high-volume, digestible)
  rather than state files.
- Integration: bd activity feed, convoys, the MEOW stack.
- Format: `plugin.md` with TOML frontmatter (name, gate type,
  tracking labels, timeout, notification).
- Gate types: cooldown (query wisps), cron, condition (exit code
  check), event, manual.

What exists today in `plugins/`:
- `compactor-dog/`, `dolt-archive/`, `dolt-backup/`,
  `dolt-log-rotate/`, `dolt-snapshots/`, `github-sheriff/`,
  `git-hygiene/`, `gitignore-reconcile/`, `quality-review/`,
  `rebuild-gt/`, `stuck-agent-dog/`, `submodule-commit/`,
  `tool-updater/`.
- Each has: `plugin.md` (definition), `run.sh` (executable),
  optional `_test.sh`, `go.mod`/`go.sum` for Go plugins.

### 10.2 npm-package/

`npm-package/package.json:1-51`:
- Package: `@gastown/gt` v1.0.0
- Purpose: NPM CLI wrapper that postinstall-downloads the native `gt`
  binary for the user's platform (darwin, linux, win32; x64, arm64).
- Entry: `bin/gt.js` shim.
- Companion files: `bin/`, `scripts/`, `README.md`, `LICENSE`.
- Not a TypeScript client — just a binary distribution channel.

### 10.3 gt-model-eval/

Node.js subtree for prompt evaluation. Contents:
`promptfooconfig.yaml`, `prompts/`, `scripts/`, `tests/`,
`package.json`. Uses the [promptfoo](https://promptfoo.dev/)
framework.

**Relevance to beads: tangential.** This subtree evaluates gt agent
*behavior* (how polecats respond to prompts), not bd integration. It
does not import bd or produce beads.

### 10.4 templates/

Directory at `templates/agents/`: `polecat-CLAUDE.md`,
`witness-CLAUDE.md`. These are Claude Code priming documents shown to
agents on session start via the SessionStart hook. They establish
agent role and behavior.

Note that the *embedded* templates used by `gt prime` live in
`internal/templates/` (see §7.6.4). The `templates/` subtree at repo
root is for agents that read them at session start via hooks.

---

## 11. Naming overlaps with gascity

Gascity (`github/gastownhall/gascity/`) and gastown are **separate
Go modules**:

- `gastown/go.mod` → `github.com/steveyegge/gastown`
- `gascity/go.mod` → `github.com/gastownhall/gascity`

`grep` of each module's go.mod confirms **no cross-imports** — gastown
does not import gascity, gascity does not import gastown. No vendored
dependency, no submodule, no go-mod replace directive between them.

The package-name overlaps are significant but implementations are
independent:

| Package | gastown path | gascity path | Relationship |
|---|---|---|---|
| agent | `internal/cmd/agents.go`, `internal/agent/` (state manager) | `internal/agent/`, `internal/agentutil/` | Both track agents; gastown emphasizes per-role packages, gascity has a more generic runtime wrapping |
| beads | `internal/beads/` (1,693-line bd CLI wrapper) | `internal/beads/` (bead store abstraction, in-memory impl) | Divergent: gastown wraps external `bd`; gascity has a `Store` interface and its own `bdstore`, `caching_store`, `filestore`, `graph_apply`, `flock`, `contract`, `exec` subsystem |
| convoy | `internal/cmd/convoy.go`, `internal/convoy/` | `internal/convoy/` | Same concept, independent code |
| formula | `internal/cmd/formula.go`, `internal/formula/` | `internal/formula/`, `internal/formulatest/` | Same concept, independent code |
| hooks | `internal/hooks/` (+ `internal/cmd/hooks_*.go`) | `internal/hooks/` | Same concept, independent code |
| mail | `internal/mail/` (+ `internal/cmd/mail_*.go`) | `internal/mail/` | Same concept, independent code |
| molecule | `internal/beads/molecule.go`, `internal/cmd/molecule_*.go` | `internal/molecule/` | Same concept, independent code |
| session | `internal/session/` (tmux + agent registry) | `internal/session/`, `internal/sessionlog/` | Both track sessions; different scopes |
| dispatch | `internal/cmd/sling_*.go` | `internal/dispatch/` (orders + routing) | Different approach: gastown has the "sling" verb; gascity has orders |
| nudgequeue | `internal/nudge/`, `internal/cmd/nudge_*.go` | `internal/nudgequeue/` | Gastown: simple poller; gascity: queue abstraction |
| orders | — | `internal/orders/` | gascity-only; structured dispatch targets |
| mayor | `internal/mayor/`, `internal/cmd/mayor.go` | — (no dedicated mayor package) | gastown-only |
| supervisor | — | `internal/supervisor/` | gascity-only |
| worker | — | `internal/worker/` | gascity-only |
| doltauth | — | `internal/doltauth/` | gascity-only (auth for Dolt server) |
| materialize/overlay/packman | — | `internal/materialize/`, `internal/overlay/`, `internal/packman/` | gascity-only (pack/overlay system) |
| workspacesvc | — | `internal/workspacesvc/` | gascity-only |

**Divergences worth flagging**:

- **Beads integration model.** Gastown shells out to `bd`
  unconditionally. Gascity has a real in-process beads store layer
  (`bdstore`, `caching_store`, `filestore`, `graph_apply`, `flock`,
  `contract`, `exec`) that abstracts storage, enables testing, and may
  enable different backends. Gastown's `store.go` is only an optional
  beadsdk adapter; gascity treats the store as a first-class interface.
- **Dispatch.** Gastown: `gt sling <bead> <target>` updates the bead
  status and the agent picks up hooked work. Gascity: orders-based
  routing (`internal/dispatch/`, `internal/orders/`), with supervisor
  and worker packages that gastown doesn't have.
- **Session model.** Gastown tracks tmux session names and agent IDs in
  a registry. Gascity has a distinct `sessionlog/` package recording
  session events, oriented around predecessor-session discovery for
  resumption.
- **K8s integration.** gascity's go.mod pulls in k8s.io dependencies;
  gastown does not.

Both repos use beads as the central ledger, and both implement
convoy/molecule/formula patterns. The implementations are orthogonal,
not shared.

---

## 12. Gaps and contradictions

### 12.1 Documentation vs. code

1. **Docs say dogs use a different schema.**
   `internal/beads/beads_dog.go:11` (comment) says dogs have a
   different schema from other agents. The code creates dogs as
   standard `gt:agent` beads with an additional `role_type:dog` label
   (`internal/beads/beads_dog.go:106-114`). Dogs are agent beads with
   extra labels, not a different schema.

2. **Plugin system described as shipped — is proposed.**
   `README.md:710` lists "Plugin system" in the design docs table, but
   `docs/design/plugin-system.md:1-4` is clearly marked as a design
   proposal. `plugins/` contains some plugin scaffolding
   (compactor-dog, dolt-archive, etc.) suggesting partial
   implementation. No user-facing `gt plugin install` command appears in
   the design doc; operators would just drop plugin dirs under
   `~/gt/plugins/` per the layout.

3. **`gt mol pour` command referenced, but `bd mol pour` is the
   syntax.** `README.md:342` shows `bd mol pour release --var
   version=1.2.0`; the gastown side uses `gt mol attach`,
   `gt mol detach`, and prime-time step rendering
   (`docs/concepts/molecules.md:74-85`). Pouring is a bd concept; the
   gastown wrapper exposes bd's pour via `bd` directly, not as a `gt`
   command.

### 12.2 Known code limitations

4. **Prefix resolution under routes.**
   `internal/beads/beads_types.go:415-422` acknowledges a bug: when a
   beads directory is accessed via a route,
   `filepath.Base(beadsDir)` yields `"rig"` instead of the actual rig
   name. Custom-prefix rigs reached via routes silently fall back to
   the default prefix `"gt"`. The comment marks fixing as
   out-of-scope — would require walking the directory tree.

5. **bd query can't parse colons in label values.**
   `internal/beads/beads.go:898-903` notes that bd query's label
   matcher can't handle colon-containing values. `ListMergeRequests`
   works around this by running raw `bd sql` on the wisps table
   (§2.8). Any gastown feature using colons in labels needs the same
   workaround.

6. **Dolt server registration delay.**
   `internal/beads/beads_types.go:382-402` retries `bd migrate` once
   with 500ms delay after `bd init --server` to let Dolt register the
   new database (referencing `GH#1769`). This is a timing workaround,
   not a root-cause fix.

7. **MR source-issue detection uses needle matching.**
   `internal/beads/beads_mr.go:115`, `MatchesMRSourceIssue`, looks for
   a specific string pattern with a trailing newline. Fragile to
   description formatting changes. A structured metadata field would be
   more robust; the comment references backward-compat for legacy
   MRs.

### 12.3 Conceptual ambiguities

8. **"Molecule" has two meanings in gastown.**
   - Bead-level: a molecule is the DAG of workflow steps parsed from a
     bead description (`internal/beads/molecule.go`).
   - Runtime: a molecule is an instance of a formula with state
     (pour vs root-only, `docs/concepts/molecules.md`).

   Both uses are legitimate but context-dependent. A reader of
   `molecule.go` without `concepts/molecules.md` will miss the
   runtime semantics.

9. **"Wisp" has two meanings in gastown.**
   - Beads concept: an ephemeral bead (`wisp_type` column in
     `docs/design/dolt-storage.md:118`), not git-tracked.
   - Gastown concept: `internal/wisp/` stores local KV config at
     `.beads-wisp/config/<rig>.json`. The name is overloaded.

10. **Agent as bead vs agent as session.** Polecats are both
    (a) an identity bead that persists across sessions and
    (b) an ephemeral tmux session. These are discrete things with
    discrete lifecycles. The code separates them cleanly
    (`internal/beads/beads_agent.go` vs `internal/polecat/`), but the
    glossary and README blur the distinction
    (`README.md:65-67`, `docs/glossary.md:40-41`).

11. **Description fields vs structured columns.** Many agent fields
    exist in both places: `hook_bead`, `role_bead`, `agent_state` are
    both bd columns AND description key-value lines
    (`ResolveAgentState` at `internal/beads/beads_agent.go:618`).
    Legacy reasons are plausible but the duplication is a foot-gun —
    mismatched values on reads/writes are possible. A migration path
    to prefer columns exclusively isn't documented.

### 12.4 Mostly-surprising choices

12. **No general bead cache.** Gastown shells out to bd on every
    Show/List/Ready — no per-bead memoization. This is deliberate
    (§2.6) for correctness under concurrent writers, but the
    aggregate latency is noticeable. Dashboards likely work around this
    with the in-process `Store` (§2.7).

13. **Beads flake input (nix) vs. no Go import.** `flake.nix:1-68`
    declares beads as a flake input. This brings the bd *binary* into
    the dev shell, but gastown still doesn't import beads as a Go
    package. If you're packaging gastown via nix, you get bd as a
    side-effect dependency — not a transparent inclusion.

14. **Two convoy subsystems.** Convoy-the-bead-type
    (`internal/convoy/`) and convoy-the-formula-type (formula flavor
    "convoy" at `internal/formula/doc.go`) share a name and overlap in
    domain. Readers can conflate them. The formula flavor is a
    workflow shape; the bead type is a work-tracking container; they
    interact when a convoy formula is instantiated as a convoy bead.

---

## See also

- [01-data-model.md](01-data-model.md) — what a bead is
- [02-cli-surface.md](02-cli-surface.md) — the `bd` CLI
- [03-concepts.md](03-concepts.md) — formulas, molecules, convoys,
  mail, nudges, memories, gates as beads concepts
- [05-gascity-integration.md](05-gascity-integration.md) — gascity's
  parallel take on the same problem (in-process store vs shell-out,
  orders vs sling)
- `docs/design/architecture.md` — two-level beads, agent taxonomy,
  merge queue
- `docs/design/dolt-storage.md` — Dolt schema, env vars, write
  concurrency
- `docs/concepts/molecules.md` — molecule lifecycle, pour vs root-only
- `docs/glossary.md` — terminology

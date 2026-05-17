# gascity metadata deep-dive

Companion to
[handbook/reference/metadata-conventions.md](handbook/reference/metadata-conventions.md)
and to `05-gascity-integration.md` §13.

The handbook catalog and the §13 table were derived from an earlier
partial scan. This doc is a **verification and expansion pass** — every
`gc.*` bead-metadata key gascity writes or reads (plus the
`convergence.*` namespace gascity also owns) is traced to its writer
and reader in the current tree at
`github/gastownhall/gascity/`.

Scope:

- `gc.*` bead-metadata keys (Store.Metadata on bead rows).
- `convergence.*` bead-metadata keys (gascity-owned, same storage,
  different prefix).
- Well-known label conventions gascity writes or consumes on beads.
- Also listed: `gc.*`-looking identifiers that are **not** bead
  metadata — OpenTelemetry metric names, contract file keys, shell
  completion filenames, test binary names. Flagged so they are not
  accidentally documented as bead metadata.

Out of scope: gastown pack metadata keys (e.g. `review.verdict`,
`design_review.verdict`) — these are written by user-level Gas Town
check scripts, not by gascity. gascity only touches them through a
named-key clear during retry (see §6.1).

Methodology. Keys were enumerated by string-literal search
(`rg -no '"gc\.[a-zA-Z_][a-zA-Z0-9_.]*"' …`) across the gascity tree
(3,230 call sites, 101 unique literals), then dynamic keys /
constants were cross-checked (`rg '= "gc\.'`). Every writer and
reader cited here was verified against the source at the line
indicated. Path prefix `github/gastownhall/gascity/` is omitted in
citations for readability.

Contents:

1. Dispatch / routing keys
2. Molecule / wisp keys
3. Graph.v2 workflow topology keys
4. Step-identity keys
5. Retry / control-loop keys
6. Execution-result keys (ralph check output)
7. Fanout / fragment keys
8. Miscellaneous keys
9. `convergence.*` namespace
10. Well-known label conventions
11. `gc.kind` value enumeration (verified)
12. Per-key summary table
13. Gaps flagged for handbook update
14. Deprecated / test-only / vestigial
15. Not bead metadata (disambiguation)

---

## 1. Dispatch / routing keys

### `gc.routed_to`

- **Purpose:** tier-3 pool routing. Workers poll
  `bd ready --metadata-field gc.routed_to=<pool> --unassigned` to claim
  pool work.
- **Writers (non-exhaustive, the primary writer is sling):**
  - `internal/sling/sling_attachment.go` — `gc sling` dispatch writes
    the target pool. Combined with pool-label management at
    `sling_attachment.go:381` (`poolLabel := "pool:" + target`).
  - `internal/graphroute/graphroute.go` — graph.v2 step routing writes
    it per step during `DecorateGraphWorkflowRecipe`.
  - `internal/molecule/molecule.go` — molecule instantiation propagates
    from recipe.
- **Readers:**
  - Worker's effective work query (the `--metadata-field
    gc.routed_to=<pool> --unassigned` pattern consumed by pool
    templates).
  - `internal/api/orders_feed.go:419` — projects it as the workflow
    target.
  - `cmd/gc/cmd_convoy_dispatch.go` — numerous reads when attaching or
    reassigning dispatches.

### `gc.execution_routed_to`

- **Purpose:** records the **original** routing decision when graph
  control flow diverts a control bead to the control dispatcher agent.
  Preserves the intended target for tracing / auditors.
- **Constant:** `internal/graphroute/graphroute.go:19`
  (`GraphExecutionRouteMetaKey = "gc.execution_routed_to"`).
- **Writers:** `internal/graphroute/graphroute.go` in
  `AssignGraphStepRoute` (writes the original assignee when divert
  happens).
- **Readers:** `internal/api/orders_feed.go:419` in
  `workflowProjectionTarget` — fallback between `gc.run_target`,
  `gc.execution_routed_to`, `gc.routed_to`.

---

## 2. Molecule / wisp keys

### `gc.continuation_group`

- **Purpose:** groups wisps of the same continuation so the
  convergence loop / reconciler can process them together.
- **Writers:** molecule layer when attaching wisps (no direct literal
  writer visible in the current tree for this exact key — propagated
  via `recipe.Steps[i].Metadata` from formula compile; presence was
  verified in `internal/formula/types.go:952` as triggering
  graph-contract enforcement).
- **Readers:** convergence loop / reconciler.

### `gc.idempotency_key`

- **Purpose:** wisp/molecule duplicate prevention. If a molecule with
  this key already exists, `molecule.Cook` refuses to create a duplicate.
- **Writers:** `molecule.Options` callers set it; stamped onto the root
  during `molecule.Cook`.
- **Readers:** `molecule.Cook` pre-check, reconciler.

### `gc.deferred_assignee`, `gc.deferred_routed_to`, `gc.deferred_execution_routed_to`, `gc.deferred_type`

- **Constants:** `internal/molecule/molecule.go:57-72`:
  - `DeferredAssigneeMetadataKey            = "gc.deferred_assignee"`
  - `DeferredRoutedToMetadataKey            = "gc.deferred_routed_to"`
  - `DeferredExecutionRoutedToMetadataKey   = "gc.deferred_execution_routed_to"`
  - `DeferredTypeMetadataKey                = "gc.deferred_type"`
- **Purpose:** `DeferAssignees` mode defers the actual assignment of
  a step until the reconciler's reveal phase. The concrete fields
  (`Assignee`, metadata `gc.routed_to`, etc.) are held in the
  `gc.deferred_*` slot and moved into place later.
- **Writers:** `internal/molecule/molecule.go` — molecule cook in
  DeferAssignees mode.
- **Readers:** reconciler reveal phase (convergence path).

### `molecule_id` (not `gc.*` but gascity-owned)

- **Purpose:** ties a work bead to its attached wisp/molecule root so
  the pool-worker prompt can branch between "follow molecule steps" and
  "execute description."
- **Writers:** sling attachment on wisp attach.
- **Readers:** pool-worker runtime prompt (checked at step 4 of the
  startup protocol — see `bd show <id>` → METADATA block).

---

## 3. Graph.v2 workflow topology keys

### `gc.kind`

- **Purpose:** step classification for graph.v2 routing. See §11 for
  the full enumerated value set.
- **Writers:**
  - `internal/formula/compile.go`, `internal/formula/graph.go`,
    `internal/formula/retry.go`, `internal/formula/ralph.go`,
    `internal/formula/source_spec.go` — formula compilation stamps
    kinds on cooked steps.
  - `internal/dispatch/control.go:414` — sets `"retry"` on synthetic
    retry control children.
  - `internal/dispatch/control.go:429` — sets `"ralph"` on ralph
    control children.
- **Readers:**
  - `internal/graphroute/graphroute.go:55-61` —
    `IsControlDispatcherKind` (divert to control dispatcher).
  - `internal/graphroute/graphroute.go:68-75` —
    `IsWorkflowTopologyKind` (skip routing entirely).
  - `internal/graphroute/graphroute.go:84` — `IsCompiledGraphWorkflow`
    test for `"workflow"`.
  - `internal/formula/types.go:949` — triggers graph-contract
    enforcement in validation.
  - Reconciler, control-dispatcher (`internal/dispatch/*.go`).

### `gc.formula_contract`

- **Purpose:** distinguishes graph.v2 root workflows from legacy
  formulas. Value is `"graph.v2"`.
- **Writers:** formula compile when emitting a graph.v2 root.
- **Readers:**
  - `internal/graphroute/graphroute.go:84` — root-step discriminator
    in `IsCompiledGraphWorkflow`.
  - Anything that checks "is this a workflow root" (reconciler,
    `IsWorkflowRoot` uses).

### `gc.parent`

- **Purpose:** hierarchy — molecule parent pointer for step beads
  outside the `ParentID` field (used when the step's direct parent is
  not the bead.ParentID but the molecule root).
- **Writers:** molecule / formula compile.
- **Readers:** hierarchy queries; reconciler.

### `gc.root_bead_id`

- **Purpose:** subtree anchor — identifies the molecule/workflow root
  so descendants can quickly jump to it.
- **Writers:** `internal/sourceworkflow/sourceworkflow.go` (launch),
  formula compile.
- **Readers:** subtree ops, singleton checks via
  `ListLiveRoots`.

### `gc.root_store_ref`

- **Purpose:** store-relative ref of the root bead, parallel to
  `gc.root_bead_id` but in ref form (human-readable) for cross-store
  lookups.
- **Writers:**
  - `internal/graphroute/graphroute.go:424` — stamped on every step
    during decoration when a root ref is available.
  - `internal/molecule/molecule.go:230,262` — propagated from parent
    bead into recipe steps during cook.
- **Readers:** `internal/molecule/molecule.go:230` — read off parent
  to propagate to children (chained).

### `gc.scope_ref`, `gc.scope_role`, `gc.scope_name`, `gc.scope_kind`

- **Purpose:** scope-check identity for graph-contract scopes. `ref`
  is the step id; `role` is the role within the scope
  (subject / check / etc); `name` is the scope's own name;
  `kind` indicates the kind of scope (graph, convergence, …).
- **Writers:**
  - Formula compile stamps `scope_ref`, `scope_role`, `scope_name` via
    `internal/formula/graph.go:49` (propagation) and related compile
    paths.
  - `internal/graphroute/graphroute.go:434-438` — sets `gc.scope_kind`
    and `gc.scope_ref` on root step during decoration.
- **Readers:**
  - `internal/dispatch/ralph.go` — `gc.scope_ref` used as retry scope
    anchor (see §5 for rewrite on retry).
  - `internal/formula/source_spec.go:55` and
    `internal/formula/graph.go:49,75`, `internal/formula/fragment.go:199`
    — keys inherited/cleared as a group during step cloning.
  - `internal/api/convoy_sql.go:280` and
    `internal/api/handler_convoy_dispatch.go:336` — `gc.scope_kind`
    consumed for convoy-scope projection.
  - `internal/formula/types.go:952` — `gc.scope_ref`, `gc.scope_role`
    trigger graph-contract enforcement.

### `gc.control_for`

- **Purpose:** control bead ↔ subject bead linkage — the control
  bead's subject is the step id stored here.
- **Writers:** graph control injection during formula compile.
- **Readers:** control dispatcher (`internal/dispatch/control.go`)
  uses it to locate the subject step.

### `gc.on_fail`

- **Purpose:** scope-check failure policy (`"soft_fail"` / `"hard_fail"`
  / etc.). Read when a scope check fails to decide what to do.
- **Writers:** formula scope metadata during compile.
- **Readers:** scope-check control logic in
  `internal/dispatch/control.go`. Also present in multiple clone-key
  lists at `formula/graph.go:75`, `formula/fragment.go:199`,
  `formula/source_spec.go:55`.

### `gc.source_bead_id`, `gc.source_store_ref`

- **Purpose:** links a graph.v2 workflow to the bead that originally
  launched it (e.g. a convoy head or source workflow). Used for
  cross-store singleton checks.
- **Writers:** `internal/sourceworkflow/sourceworkflow.go` during
  launch; `internal/graphroute/graphroute.go:429-431` propagates onto
  the root step during decoration.
- **Readers:** `ListLiveRoots`, singleton dispatch.

### `gc.run_target`

- **Purpose:** canonical "this workflow runs on this agent/pool" used
  by projections. Written on the root step.
- **Writers:** `internal/graphroute/graphroute.go:427` — stamped on
  the root during decoration (`step.Metadata["gc.run_target"] =
  routedTo`).
- **Readers:** `internal/api/orders_feed.go:419` —
  `workflowProjectionTarget` preferred key.

### `gc.output_json`, `gc.output_json_required`

- **Purpose:** structured output propagation. When a step produces
  JSON output (either directly or via ralph), `gc.output_json` holds
  the serialized payload. `gc.output_json_required` marks the step as
  required-to-produce-output (graph-compile flag).
- **Writers:**
  - `internal/dispatch/runtime.go:166,245` —
    `store.SetMetadata(body.ID, "gc.output_json", outputJSON)` on the
    bead body when a step completes.
  - `internal/dispatch/ralph.go:62-63` — propagated from subject onto
    logical bead during ralph retry.
  - `internal/dispatch/control.go:55-56,172-173` — propagated during
    retry/iteration transitions.
  - `internal/formula/graph.go:33`,
    `internal/formula/ralph.go:107,145,263` — compile sets
    `gc.output_json_required = "true"`.
- **Readers:** same call sites; also consumed by downstream
  scope-check logic (`internal/dispatch/control.go`).

### `gc.outcome`

- **Purpose:** pass/fail verdict for control-bead kinds (checks,
  scope-checks, retry results).
- **Writers:**
  - `internal/dispatch/retry.go:266-272` — `pass` / `fail`.
  - `internal/dispatch/control.go:189` — sets `fail` on failed
    iteration.
  - `cmd/gc/cmd_convoy_dispatch.go:556,701` and
    `internal/api/huma_handlers_convoys.go:535,678` —
    `CloseAll(..., {"gc.outcome": "skipped"})` for convoy cleanup.
- **Readers:**
  - `internal/dispatch/retry.go:229` — read on subject during retry
    evaluation.
  - `internal/api/handler_convoy_dispatch.go:487` — projection input.

---

## 4. Step-identity keys

### `gc.step_id`

- **Purpose:** logical step identifier (formula-level, stable across
  retries). Distinct from the bead ID.
- **Writers:** `internal/formula/retry.go:70,89`;
  `internal/dispatch/control.go:350,400` (stamped on synthetic
  retry/ralph control children).
- **Readers:** `internal/dispatch/control.go:322,752,885`;
  `internal/dispatch/runtime.go:685`;
  `internal/dispatch/fanout.go` (partial-fragment handling).

### `gc.step_ref`

- **Purpose:** runtime step reference — the step id (or rewritten
  form) used for identification across retry attempts. Written on all
  step beads so fanout/retry can correlate.
- **Writers:**
  - `internal/molecule/molecule.go:445,653` — default to step ID on cook.
  - `internal/molecule/graph_apply.go:156-157,302-303` — same pattern.
  - `internal/dispatch/ralph.go:288,321,350,486` — rewritten on
    retry via `rewriteRetryStepRef` to distinguish attempts.
- **Readers:** `internal/dispatch/runtime.go:669,676,739`;
  `internal/dispatch/fanout.go:196,460`;
  `internal/dispatch/ralph.go:240,598`; plus the same clone-key
  lists as `gc.scope_ref`.

### `gc.ralph_step_id`

- **Purpose:** ralph-owned logical step id — same concept as
  `gc.step_id` but specifically marks the step as ralph-owned (vs. a
  plain retry). Used to route the step to the ralph controller.
- **Writers:** `internal/formula/ralph.go:100,140,199`;
  `internal/dispatch/control.go:357,402`.
- **Readers:** `internal/dispatch/runtime.go:686`;
  `internal/molecule/molecule.go:954`; present in clone/clear key
  lists at `formula/graph.go:49,75`, `formula/fragment.go:199`,
  `formula/source_spec.go:55`.

### `gc.logical_bead_id`

- **Purpose:** ties a concrete (attempt) bead back to its stable
  logical bead (the subject whose retries produce multiple attempt
  beads). `logical_bead_id` points at the persistent subject id.
- **Writers:**
  - `internal/molecule/graph_apply.go:169,308` — on cook, stamped via
    `MetadataRefs`/`Metadata` if a logical step id is registered.
  - `internal/molecule/molecule.go:464,661,663` — same pattern during
    cook.
  - `internal/dispatch/ralph.go:287,349,378-384,491-500` — rewritten
    on retry so the new attempt points at the existing logical id.
- **Readers:**
  - `internal/dispatch/runtime.go:454,661` — "is this the logical
    bead or an attempt?"
  - `internal/dispatch/fanout.go:369` — matches attempts to fanout
    parents.

### `gc.spec_for`, `gc.spec_for_ref`

- **Purpose:** `gc.kind="spec"` beads carry a step spec (JSON). These
  two keys identify which step the spec describes
  — `spec_for` is the raw id, `spec_for_ref` is the namespaced form
  (used after fanout expansion).
- **Writers:** `internal/formula/source_spec.go:27-28` (initial cook);
  `internal/formula/source_spec.go:58-61` (rewrite during
  namespacing); `internal/dispatch/control.go:795-796` — stamped on
  synthetic spec beads.
- **Readers:** `internal/dispatch/control.go:769,774` — spec lookup
  for a control bead's subject.

### `gc.step_timeout`, `gc.check_timeout`

- **Purpose:** per-step and per-check timeout overrides. Parsed as
  Go duration strings.
- **Writers:** `internal/dispatch/control.go:437` —
  `childMeta["gc.step_timeout"] = child.Timeout`; compile/retry for
  check side.
- **Readers:**
  - `internal/dispatch/ralph.go:172-180` — parsed during ralph exec.
  - `internal/molecule/molecule.go:817` — enumerated in timeout-key
    propagation set.

### `gc.check_mode`, `gc.check_path`

- **Purpose:** check control metadata. `gc.check_mode` declares the
  check execution mode (`"exec"` is the only supported value);
  `gc.check_path` is the absolute path to the check script.
- **Writers:** formula compile (check steps).
- **Readers:** `internal/dispatch/ralph.go:22-23`,
  `internal/dispatch/ralph.go:138-140` — mode validation and path
  resolution during check exec.

### `gc.city_path`

- **Purpose:** absolute path to the active city. Consumed by check
  scripts that need to look up adjacent files (e.g. review scripts).
- **Writers:** formula compile or dispatch stamping (propagated from
  parent metadata; read via `resolveInheritedMetadata` which walks
  ancestors).
- **Readers:** `internal/dispatch/ralph.go:144` —
  `resolveInheritedMetadata(store, bead, "gc.city_path")`.

### `gc.work_dir`

- **Purpose:** working directory for exec-backed checks.
  `resolveInheritedMetadata` reads either `work_dir` (unprefixed) or
  `gc.work_dir` — the former is the canonical key, the latter a
  fallback.
- **Writers:** formula compile / convoy dispatch.
- **Readers:** `internal/dispatch/ralph.go:150` —
  `resolveInheritedMetadata(store, bead, "work_dir", "gc.work_dir")`.

### `gc.terminal`

- **Purpose:** marks a check/control bead as terminal, meaning no
  further retry attempts can be produced from it.
  Value `"true"` is the only meaningful setting.
- **Writers:**
  - `internal/dispatch/ralph.go:348` — set to `""` (cleared) on the
    new check during retry cook.
- **Readers:** `internal/dispatch/ralph.go:19` — early return in check
  execution if terminal.

---

## 5. Retry / control-loop keys

These keys are **not in the current handbook** and form the bulk of
the delta. Collectively they implement:

- a bounded retry loop (`gc.attempt` / `gc.max_attempts` /
  `gc.next_attempt`);
- a retry state machine (`gc.retry_state`: `spawning` → `spawned`);
- failure classification persisted on the subject
  (`gc.failure_class`: `transient` | `hard`;
  `gc.failure_reason`; `gc.final_disposition`: `pass` | `soft_fail` |
  `hard_fail` | `controller_error`);
- a structured attempt log (`gc.attempt_log`);
- subject-level bookkeeping so the convergence loop and cache see a
  consistent state across attempts (`gc.closed_by_attempt`,
  `gc.retry_session_recycled`).

### `gc.attempt`

- **Purpose:** attempt counter for retry/ralph control kinds; 1-based.
- **Writers:**
  - `internal/formula/retry.go`, `internal/formula/ralph.go` — stamped
    on first cook.
  - `internal/dispatch/ralph.go:285,316,346,481` — incremented on
    successive cooks (`nextAttempt`).
  - `internal/dispatch/control.go:349,398` — stamped on synthetic
    retry/ralph children.
- **Readers:**
  - `internal/molecule/molecule.go:924`,
    `internal/dispatch/runtime.go:463`,
    `internal/dispatch/ralph.go:26-28,737` — guard /parse.
  - `internal/dispatch/control.go:45,145` — driver loop.

### `gc.max_attempts`

- **Purpose:** upper bound for the retry loop.
- **Writers:** `internal/dispatch/control.go:415,430` —
  `childMeta["gc.max_attempts"] = strconv.Itoa(child.Retry.MaxAttempts)`
  / `child.Ralph.MaxAttempts`.
- **Readers:** `internal/dispatch/ralph.go:30-32`,
  `internal/dispatch/control.go:23,128` — validated; drive the loop.

### `gc.next_attempt`

- **Purpose:** "the next attempt's number" — transient hint held
  between `spawning` and `spawned` states.
- **Writers / readers:** `internal/dispatch/ralph.go:95,114`;
  cleared via `clearRetryEphemera` at ralph.go:869.

### `gc.failed_attempt`

- **Purpose:** the attempt number that failed. Persisted on the
  subject when recording a failure.
- **Writers:** `internal/dispatch/ralph.go:76`,
  `internal/dispatch/control.go:74,190,224,238`.
- **Readers:** cleared via `clearRetryEphemera` at ralph.go:865.

### `gc.closed_by_attempt`

- **Purpose:** marks a stale attempt's bead as "closed by attempt N"
  so the convergence loop knows not to re-open it.
- **Writers:** `internal/dispatch/retry.go:64,79,99,116`.
- **Readers:** `internal/dispatch/retry.go:33` — short-circuits if
  `closedBy >= attempt`.

### `gc.retry_count`

- **Purpose:** count of retries applied (distinct from `gc.attempt`,
  which is the attempt _index_; `gc.retry_count` accumulates when a
  subject is retried independently of the control loop).
- **Writers:** `internal/dispatch/retry.go:183`.

### `gc.retry_from`

- **Purpose:** on a newly-cooked attempt, points back at the bead id
  of the previous attempt it was spawned from. Lets observers walk
  the retry chain.
- **Writers:** `internal/dispatch/ralph.go:286,317,347,482`.

### `gc.retry_state`

- **Purpose:** two-state machine for ralph retry control beads:
  `spawning` (about to create the next attempt) → `spawned` (next
  attempt exists, control is waiting on its outcome).
- **Writers / readers:** `internal/dispatch/ralph.go:90,94,106,113`;
  cleared via `clearRetryEphemera` at ralph.go:868.

### `gc.retry_session_recycled`

- **Purpose:** once-per-subject flag — indicates the retry loop has
  already recycled the session for this subject (so the subsequent
  retry uses a fresh session instead of re-using the failed one).
- **Writers / readers:** `internal/dispatch/retry.go:157,164`;
  cleared via `clearRetryEphemera` at ralph.go:876.

### `gc.partial_retry`

- **Purpose:** marks an attempt as being retried **partially** (a
  subset of its fanout siblings) rather than re-running the entire
  fanout.
- **Writers:** `internal/dispatch/ralph.go:1113`.
- **Readers:** `internal/dispatch/ralph.go:952`.

### `gc.on_exhausted`

- **Purpose:** behavior when `gc.attempt == gc.max_attempts` with a
  failing outcome. Values: `"hard_fail"` (default) or `"soft_fail"`.
- **Writers:** `internal/dispatch/control.go:418,420` (from
  `child.Retry.OnExhausted`).
- **Readers:** `internal/dispatch/control.go:27`,
  `internal/dispatch/retry.go:20`.

### `gc.control_epoch`

- **Purpose:** optimistic concurrency guard on a molecule attach
  bead. Ensures that only one processor instantiates steps for a
  given attach operation — if two racing processors both read the
  same epoch, one will fail the CAS via `SetMetadata`.
- **Writers:** `internal/molecule/molecule.go:292` —
  `store.SetMetadata(attachBeadID, "gc.control_epoch", nextEpoch)`.
  Formula compile seeds `"1"` at
  `internal/formula/retry.go:73` and `internal/formula/ralph.go:76`.
  `internal/dispatch/control.go:416,431` initialises new control
  children with `"1"`.
- **Readers:** `internal/dispatch/control.go:301`;
  `internal/molecule/molecule.go:247`.

### `gc.original_kind`

- **Purpose:** preserves the original `gc.kind` before a step was
  rewritten (e.g., a `task` → `retry-run` rewrite) so observers can
  reconstruct the original shape.
- **Writers:** `internal/formula/retry.go:76,95`.

### `gc.attempt_log`

- **Purpose:** structured JSON log of every attempt (attempt number,
  outcome, failure reason). Appended on each attempt by the control
  bead as the retry loop progresses.
- **Writers:** `internal/dispatch/control.go:973` —
  `store.SetMetadata(controlID, "gc.attempt_log", string(logJSON))`.
- **Readers:** `internal/dispatch/control.go:942` — parsed on re-entry.

### `gc.controller_error`

- **Purpose:** captures a **controller-level** error (bug in the
  control bead's own handler) separately from an **attempt** failure.
  When set, disposition is `"controller_error"`.
- **Writers / readers:** `internal/dispatch/control.go:109,208`.

### `gc.failure_class`

- **Purpose:** `"transient"` (retryable) or `"hard"` (not retryable).
- **Writers:** `internal/dispatch/retry.go:267-273`;
  `internal/dispatch/control.go:75,225,239`.
- **Readers:** `internal/dispatch/retry.go:232,237`.

### `gc.failure_reason`

- **Purpose:** free-text reason string accompanying a failure class.
- **Writers:** `internal/dispatch/retry.go:185,262`;
  `internal/dispatch/control.go:76,226,240`.
- **Readers:** `internal/dispatch/retry.go:232,253`.

### `gc.final_disposition`

- **Purpose:** terminal verdict for the subject across all attempts.
  Values: `"pass"`, `"soft_fail"`, `"hard_fail"`, `"controller_error"`.
- **Writers:** `internal/dispatch/retry.go:65,83,103,120`;
  `internal/dispatch/control.go:77,110,209,227,241`.

### `gc.last_failure_class`

- **Purpose:** the most recent failure class (useful for observers
  that don't want to walk the attempt log). Value is the same
  domain as `gc.failure_class`.
- **Writers:** `internal/dispatch/retry.go:184`.

### `gc.source_step_spec` (**vestigial — see §14**)

- **Purpose:** originally stored a serialized step spec on control
  beads. Replaced by `gc.kind="spec"` beads; the key is still read
  once at `internal/dispatch/control.go:254` for backward
  compatibility but is never written by current non-test code.
  Source-spec tests at `internal/formula/source_spec_test.go:36-77`
  explicitly assert the key is **empty** on cooked control beads.

---

## 6. Execution-result keys (ralph check output)

When ralph executes a check script, the result is written back onto
the check bead as structured metadata. All of these are set atomically
in `internal/dispatch/ralph.go:209-218` (and cleared by
`clearRetryEphemera` before each retry).

### `gc.exit_code`

Integer as string. Empty string if the process exited without one
(e.g., killed by signal).

Writer: `internal/dispatch/ralph.go:216-218`.

### `gc.stdout`, `gc.stderr`

Captured stdout/stderr output (truncated — see `gc.truncated`).

Writer: `internal/dispatch/ralph.go:210-211`.

### `gc.duration_ms`

Wall-clock duration of the check execution in milliseconds, as a
decimal string.

Writer: `internal/dispatch/ralph.go:212`.

### `gc.truncated`

Boolean (`"true"` / `"false"`) — whether the captured stdout/stderr
was truncated to fit within the storage budget.

Writer: `internal/dispatch/ralph.go:213`.

### 6.1. Retry ephemera clear set

`internal/dispatch/ralph.go:852-883` defines the full set of keys
cleared from a subject's metadata before each retry attempt. The full
set:

```
gc.outcome              gc.exit_code            gc.stdout
gc.stderr               gc.output_json          gc.duration_ms
gc.truncated            gc.terminal             gc.failed_attempt
gc.fanout_state         gc.spawned_count        gc.retry_state
gc.next_attempt         gc.partial_retry        gc.failure_class
gc.failure_reason       gc.final_disposition    gc.closed_by_attempt
gc.last_failure_class   gc.retry_session_recycled
review.verdict          design_review.verdict   code_review.verdict
```

The last three are **gastown pack-specific** keys set by review
scripts (see `examples/gastown/packs/gastown/assets/scripts/checks/*.sh`).
gascity itself does not write them — it only clears them here so
stale verdicts do not bleed into the next attempt.

---

## 7. Fanout / fragment keys

### `gc.for_each`

- **Purpose:** fanout template — the list expression that drives
  expansion. Value is a JSON array or a template reference.
- **Writers / readers:** formula compile; fanout processor in
  `internal/dispatch/fanout.go`.

### `gc.bond`, `gc.bond_vars`

- **Purpose:** fanout "bond" — post-fanout aggregation semantics.
  `bond` is the bond name; `bond_vars` is the JSON-encoded variable
  set.
- **Writers / readers:** formula compile; fanout processor.

### `gc.fanout_mode`

- **Purpose:** fanout execution mode (parallel / sequential / …).
- **Writers / readers:** formula compile; fanout processor.

### `gc.fanout_state`

- **Purpose:** runtime state of the fanout — tracks progress through
  expansion and aggregation.
- **Writers / readers:** fanout processor.
- Cleared via `clearRetryEphemera` at ralph.go:866.

### `gc.spawned_count`

- **Purpose:** how many child beads were spawned by a fanout.
- **Writers:** `internal/dispatch/fanout.go:173`.
- Cleared via `clearRetryEphemera` at ralph.go:867.

### `gc.partial_fragment`

- **Purpose:** marks a fanout bead as representing only a subset of
  its siblings — set when a fanout is retried on a failed subset
  rather than in full.
- **Writers:** `internal/dispatch/fanout.go:398`.
- **Readers:** `internal/dispatch/fanout.go:193`.

### `gc.dynamic_fragment`

- **Purpose:** marks a step as being dynamically expanded (at runtime,
  not compile time). Used by fragment handling.
- **Writers:** `cmd/gc/cmd_convoy_dispatch.go:302` —
  `step.Metadata["gc.dynamic_fragment"] = "true"`.
- **Readers:** `internal/dispatch/ralph.go:603,648,1073`.

---

## 8. Miscellaneous keys

### `gc.workflow_id`

- **Purpose:** logical workflow identifier — a shared id across all
  beads belonging to the same workflow run (distinct from
  `gc.root_bead_id`, which is the concrete bead id of the root).
  Used by convoy-dispatch to locate workflow siblings when the root
  bead id is not yet known (or when the same workflow has been
  re-run).
- **Writers:**
  - `cmd/gc/cmd_convoy_dispatch.go:1296` — stamped on steps during
    convoy dispatch.
  - `internal/api/handler_convoy_dispatch.go:69`,
    `internal/api/huma_handlers_convoys.go:511,649` — stamped during
    API-driven convoy dispatch.
- **Readers:**
  - `internal/api/convoy_event_stream.go:278,369` — SSE event stream
    projection.
  - `internal/api/handler_convoy_dispatch.go:215` — selection pre-check.
  - `internal/api/convoy_sql.go:454` — SQL predicate.
  - `cmd/gc/cmd_convoy_dispatch.go:1270` — resolution during dispatch.

### `gc.session_affinity`

- **Purpose:** `"require"` pins a bead to the session that created it
  (see memory `phase-1-bead-reappears…`). Without affinity, a bead's
  claim clears on worker drain and the bead re-enters the pool.
- **Writers / readers:** not found by string literal in the current
  tree under this exact spelling — the key may be read under a
  constant name, or the recorded handbook description is forward-
  looking (feature not yet wired). **Evidence inconclusive.** Flag
  for verification before documenting further.

### `gc.template`

- **Purpose:** on a session bead (`type=session`), identifies the
  agent template this session instance is for (used by
  `findSessionNameByTemplate` to map qualified agent → session name).
- **Writers:** session-bead creation (session manager).
- **Readers:** `internal/agentutil/pool.go:59` —
  `b.Metadata["gc.template"] == qualifiedName`.

### `gc.session` (as a **label**, with caveat)

Two different spellings exist in-tree and they do not match:

- `"gc:session"` (colon) — canonical; defined as
  `sessionBeadLabel` (`cmd/gc/session_beads.go:22`) and
  `LabelSession` (`internal/session/manager.go:57`). Used for
  **session-bead discovery** everywhere that matters:
  `cmd/gc/cmd_stop.go:132`, `cmd/gc/template_resolve.go:199`,
  `cmd/gc/session_beads.go:33`, `cmd/gc/session_name_lookup.go:191`,
  `cmd/gc/adoption_barrier.go:85`.
- `"gc.session"` (dot) — **appears once** at
  `internal/agentutil/pool.go:52`:

  ```go
  beadList, err := store.List(beads.ListQuery{
      Type:   "session",
      Label:  "gc.session",
      Status: "open",
  })
  ```

  No session bead is ever created with this label, so this query
  silently returns zero results. This is a bug — the agentutil copy
  of `findSessionNameByTemplate` is dead code, shadowed by the
  `cmd/gc/session_name_lookup.go:146` version which uses the
  snapshot-based path. **Flag for gascity issue.**

### `gc.formula_name`

- **Purpose:** (intended) human-readable formula name on a workflow
  root, used as a projection fallback when the bead's `Ref` is empty.
- **Writers:** **none in the current tree.** Only reader is
  `internal/api/orders_feed.go:405` as a fallback in
  `workflowFormulaName`. Either the feature is not yet wired or the
  write path was removed and the read was left. **Flag as
  vestigial / incomplete** — see §13.

---

## 9. `convergence.*` namespace

gascity owns a **second** metadata namespace: `convergence.*`. It
lives on beads created by the convergence-loop primitive (used by
order workflows and formula `converge:` blocks) and is not currently
documented in `handbook/reference/metadata-conventions.md`.

The canonical list is enumerated in
`internal/convergence/metadata.go:12-40` as named constants. Reproduced
below in the same order:

| Constant | Key | Purpose |
|---|---|---|
| `FieldState` | `convergence.state` | `creating` / `active` / `waiting_manual` / `terminated` |
| `FieldIteration` | `convergence.iteration` | current loop iteration (int) |
| `FieldMaxIterations` | `convergence.max_iterations` | upper bound |
| `FieldFormula` | `convergence.formula` | formula id this loop runs |
| `FieldTarget` | `convergence.target` | target agent/pool |
| `FieldGateMode` | `convergence.gate_mode` | `manual` / `condition` / `hybrid` |
| `FieldGateCondition` | `convergence.gate_condition` | gate condition expression |
| `FieldGateTimeout` | `convergence.gate_timeout` | duration string |
| `FieldGateTimeoutAction` | `convergence.gate_timeout_action` | `iterate` / `retry` / `manual` / `terminate` |
| `FieldActiveWisp` | `convergence.active_wisp` | wisp currently being processed |
| `FieldLastProcessedWisp` | `convergence.last_processed_wisp` | cursor |
| `FieldAgentVerdict` | `convergence.agent_verdict` | `approve` / `approve-with-risks` / `block` (normalized) |
| `FieldAgentVerdictWisp` | `convergence.agent_verdict_wisp` | wisp that produced the verdict |
| `FieldGateOutcome` | `convergence.gate_outcome` | `pass` / `fail` / `timeout` / `error` |
| `FieldGateExitCode` | `convergence.gate_exit_code` | exit code of the gate script |
| `FieldGateOutcomeWisp` | `convergence.gate_outcome_wisp` | wisp that produced the gate outcome |
| `FieldGateRetryCount` | `convergence.gate_retry_count` | retry counter for gate evaluation |
| `FieldTerminalReason` | `convergence.terminal_reason` | `approved` / `no_convergence` / `stopped` / `partial_creation` |
| `FieldTerminalActor` | `convergence.terminal_actor` | who terminated (agent name) |
| `FieldWaitingReason` | `convergence.waiting_reason` | `manual` / `hybrid_no_condition` / `timeout` / `sling_failure` |
| `FieldRetrySource` | `convergence.retry_source` | source of retry trigger |
| `FieldCityPath` | `convergence.city_path` | absolute city path |
| `FieldEvaluatePrompt` | `convergence.evaluate_prompt` | prompt for the evaluator agent |
| `FieldGateStdout` | `convergence.gate_stdout` | captured gate stdout |
| `FieldGateStderr` | `convergence.gate_stderr` | captured gate stderr |
| `FieldGateDurationMs` | `convergence.gate_duration_ms` | wall-clock duration in ms |
| `FieldGateTruncated` | `convergence.gate_truncated` | `"true"` / `"false"` |
| `FieldPendingNextWisp` | `convergence.pending_next_wisp` | next wisp queued for processing |

Also defined in the same file:

- `VarPrefix = "var."` — template-variable prefix. Keys of the form
  `var.<name>` carry user-supplied variables that the convergence
  formula substitutes into gate prompts. Example at
  `internal/convergence/retry_test.go:35`:
  `VarPrefix + "doc_path": "/docs/readme.md"`.

Writers are in `internal/convergence/` and the convergence-tick path
at `cmd/gc/convergence_tick.go` and `cmd/gc/cmd_converge.go`. Readers
are numerous across `cmd/gc/cmd_converge.go`, `cmd/gc/convergence_store.go`
etc.

**This entire namespace is missing from the current handbook.**
It should either be surfaced with its own section under "Canonical
conventions" in `metadata-conventions.md`, or the metadata-conventions
doc should cross-link to a dedicated `convergence-metadata.md` —
there are 28 keys plus a variable-prefix, which is too many to fold
into an existing section without noise.

---

## 10. Well-known label conventions

gascity writes and consumes labels (as distinct from metadata) for a
number of subsystems. The handbook lists `gt:agent`, `role_type:dog`,
`severity:critical`, `channel:<name>`, `thread:<id>`, `read` — most
of which belong to gastown, not gascity. The actual gascity-originated
labels are:

### Session / wait / nudge discriminator labels (single-purpose)

| Label | Constant | Defined at | On what bead |
|---|---|---|---|
| `gc:session` | `sessionBeadLabel` / `LabelSession` | `cmd/gc/session_beads.go:22`, `internal/session/manager.go:57` | Session bead — one per running session. |
| `gc:wait` | `WaitBeadLabel` | `internal/session/waits.go:19` | Session wait bead — tracks a session's wait state. |
| `gc:nudge` | `nudgeBeadLabel` | `cmd/gc/nudge_beads.go:16` | Nudge bead — one per in-flight nudge. |

### Message / external-messaging labels (`gc:extmsg-*`)

Defined in `internal/extmsg/labels.go:11-18`. One base label per bead
kind plus a set of content-hashed companions keyed by conversation
ref / session id for indexed lookup:

| Label | Purpose |
|---|---|
| `gc:extmsg-binding` | A binding bead mapping a gascity session to an external conversation. |
| `gc:extmsg-delivery` | A delivery bead recording an outbound message. |
| `gc:extmsg-group` | A group bead (extmsg-level group identity). |
| `gc:extmsg-group-participant` | A participant bead within a group. |
| `gc:extmsg-membership` | A membership bead (which sessions are in a conversation). |
| `gc:extmsg-transcript` | A transcript bead. |
| `gc:extmsg-transcript-state` | A transcript state bead. |

Companion hashed labels (all defined at `internal/extmsg/labels.go:20-33`,
built via SHA-256 over normalized conversation-ref fields):

- `extmsg:binding:conv:v1:<sha>`, `extmsg:binding:session:v1:<session>`
- `extmsg:delivery:route:v1:<sha>`, `extmsg:delivery:session:v1:<session>`
- `extmsg:group:root:v1:<sha>`, `extmsg:group:participant:v1:<group>`,
  `extmsg:group:participant:session:v1:<session>`
- `extmsg:transcript:conv:v1:<sha>`, `extmsg:transcript:bucket:v1:<sha+bucket>`,
  `extmsg:transcript:msg:v1:<sha+msg>`
- `extmsg:membership:conv:v1:<sha>`, `extmsg:membership:session:v1:<session>`,
  `extmsg:membership:exact:v1:<sha+session>`
- `extmsg:transcript:state:v1:<sha>`

These are not meant for human use — they are content-hashed join
keys. Beads-UI should probably render them as opaque "extmsg join
key" badges rather than expose the hash.

### Routing / topology labels

| Label | Source | Purpose |
|---|---|---|
| `pool:<target>` | `internal/sling/sling_attachment.go:381` | Pins a bead to a specific pool. Sling manages these, removing stale `pool:*` before adding the new one (`sling_attachment.go:343-396`). |
| `agent:<name>` | `cmd/gc/session_beads.go:715`, `cmd/gc/session_name_lookup.go:47`, `cmd/gc/adoption_barrier.go:210`, `cmd/gc/nudge_beads.go:109` | Identifies which configured agent template a bead belongs to. |
| `nudge:<id>` | `cmd/gc/nudge_beads.go:46`, `internal/nudgequeue/waits.go:85` | Joins a nudge bead to its target. |
| `session:<id>` | `internal/session/waits.go:90,128-129,202`, `cmd/gc/cmd_wait.go:211,408` | Joins a wait bead to a specific session id. |
| `thread:<id>` | `internal/mail/beadmail/beadmail.go:35,155,160,179,310`, `cmd/gc/cmd_handoff.go:165,288` | Mail thread id. |
| `reply-to:<id>` | `internal/mail/beadmail/beadmail.go:160,311` | On a mail reply bead, identifies the bead being replied to. |
| `priority:<0-9>` | `internal/mail/beadmail/beadmail.go:338-340` | Mail priority. Read via `extractPriority`. |
| `order:<scoped-name>` | `cmd/gc/order_dispatch.go:199`, `cmd/gc/cmd_order.go:502,506,844`, `internal/api/orders_feed.go:341` | Identifies an order and its tracking bead (`title = "order:<name>"`). |
| `order-run:<scoped-name>` | `cmd/gc/order_dispatch.go:200,348,412`, `cmd/gc/cmd_order.go:502` | One-off order run instance. |
| `order-tracking` | `cmd/gc/order_dispatch.go:20` (const `labelOrderTracking`) | Marks the persistent tracking bead for an order. |
| `wisp`, `wisp-canceled`, `wisp-failed` | `cmd/gc/order_dispatch.go:297,319,341,369,380` | Wisp lifecycle. Added to order tracking beads when the wisp starts / is canceled / fails. |
| `owned` | `cmd/gc/cmd_convoy.go:181`, `internal/sling/sling_core.go:299` | Convoy opt-out from auto-close. Checked at `cmd/gc/cmd_convoy.go:559,828,843,1025,1151`. |
| `gate:<json>` / `gate:<wait-id>` | `internal/formula/compile.go:341`, `internal/formula/controlflow.go:540` | Graph.v2 gate metadata serialized onto the target step. |
| `loop:<json>` | `internal/formula/controlflow.go:200` | Loop metadata on the first step of an expanded conditional loop. |

### Legacy / no longer consumed

- `gc:message` — the legacy "this is a mail bead" label. Removed in
  gascity issue #862; replaced by `bead.Type == "message"`. The label
  is no longer written or read by the mail backend (confirmed at
  `internal/mail/beadmail/beadmail.go:250-251,294-295`).

---

## 11. `gc.kind` value enumeration (verified)

The current handbook lists: `workflow`, `workflow-finalize`, `fanout`,
`scope-check`, `retry`, `ralph`, `check`. The full set actually
observed in the tree (non-test writers and readers) is larger.

### Control-dispatcher kinds

Routed to the control dispatcher agent.
Source: `internal/graphroute/graphroute.go:55-61` (`IsControlDispatcherKind`):

- `check`
- `fanout`
- `retry-eval`
- `scope-check`
- `workflow-finalize`
- `retry`
- `ralph`

### Workflow-topology kinds

Never routed — exist only to structure the graph.
Source: `internal/graphroute/graphroute.go:68-75` (`IsWorkflowTopologyKind`):

- `workflow` — root workflow step.
- `scope` — scope boundary.
- `spec` — formula step spec (carries the JSON serialization of a step).

### Work kinds (runnable steps)

Source: `internal/formula/types.go:949` (graph-contract requirement)
and non-test call sites:

- `task` — a regular task step.
- `run` — a run step (formula-generated run wrapper).
- `cleanup` — cleanup step.
- `retry-run` — the run-side of a retry pair (the ralph retry creates
  `retry-eval` + `retry-run` control children).

The handbook lists `ralph` under control dispatcher kinds and this is
correct — `ralph` is the controller side; `retry-run` is the paired
run side. Both require the graph.v2 contract.

### Proposed handbook update

Add the following table to `handbook/reference/metadata-conventions.md`
under the Graph.v2 section, replacing the single-line `gc.kind` row:

```
**`gc.kind` values** — verified against
`internal/graphroute/graphroute.go:55-75` and
`internal/formula/types.go:947-951`:

| Category            | Values                                                       |
|---------------------|--------------------------------------------------------------|
| Control dispatcher  | `check`, `fanout`, `retry-eval`, `scope-check`, `workflow-finalize`, `retry`, `ralph` |
| Workflow topology   | `workflow`, `scope`, `spec`                                  |
| Work (runnable)     | `task`, `run`, `cleanup`, `retry-run`                        |
```

---

## 12. Per-key summary table

Compact reference. Every non-trivial claim is cited in the per-section
prose above. Keys are grouped by purpose, not alphabetical, so related
keys read together.

| Key | Writer | Reader | Purpose | Current handbook? | Update needed? |
|---|---|---|---|---|---|
| `gc.routed_to` | `internal/sling/sling_attachment.go`, `internal/graphroute/graphroute.go` | worker work-query tier 3; `internal/api/orders_feed.go` | pool routing | yes | no |
| `gc.execution_routed_to` | `internal/graphroute/graphroute.go` `AssignGraphStepRoute` | `internal/api/orders_feed.go:419` | original route on divert | yes | no |
| `gc.continuation_group` | formula compile (indirect) | convergence loop | wisp grouping | yes | no |
| `gc.idempotency_key` | `molecule.Options` callers | `molecule.Cook` | duplicate prevention | yes | no |
| `gc.deferred_assignee` | `internal/molecule/molecule.go:57` | reconciler reveal | deferred assignment | yes | no |
| `gc.deferred_routed_to` | `internal/molecule/molecule.go:62` | reconciler reveal | deferred routing | yes | no |
| `gc.deferred_execution_routed_to` | `internal/molecule/molecule.go:66` | reconciler reveal | deferred exec route | yes | no |
| `gc.deferred_type` | `internal/molecule/molecule.go:71` | reconciler reveal | deferred type | yes | no |
| `molecule_id` | sling wisp-attach | pool-worker prompt | molecule linkage | yes | no |
| `gc.kind` | formula compile; `internal/dispatch/control.go:414,429` | `internal/graphroute/graphroute.go:55-75` | step classification | yes (partial) | **yes — add full value table (§11)** |
| `gc.formula_contract` | formula compile | `internal/graphroute/graphroute.go:84` | graph.v2 root discriminator | yes | no |
| `gc.parent` | molecule / formula | hierarchy queries | hierarchy | yes | no |
| `gc.root_bead_id` | `internal/sourceworkflow/sourceworkflow.go`, formula compile | subtree ops; `ListLiveRoots` | subtree anchor | yes | no |
| `gc.root_store_ref` | `internal/graphroute/graphroute.go:424`, `internal/molecule/molecule.go:262` | `internal/molecule/molecule.go:230` | root store ref | **no** | **yes — add** |
| `gc.scope_ref` | formula compile; `internal/graphroute/graphroute.go:438` | `internal/dispatch/ralph.go`; scope-check | scope identity | yes | no |
| `gc.scope_role` | formula compile | scope-check | scope role | yes | no |
| `gc.scope_name` | formula compile | scope-check | scope name | yes | no |
| `gc.scope_kind` | `internal/graphroute/graphroute.go:435` | `internal/api/convoy_sql.go:280`, `internal/api/handler_convoy_dispatch.go:336` | scope kind | **no** | **yes — add** |
| `gc.control_for` | graph control injection | control dispatcher | control↔subject link | yes | no |
| `gc.on_fail` | formula compile | `internal/dispatch/control.go` scope-check | scope failure policy | yes | no |
| `gc.source_bead_id` | `internal/sourceworkflow/sourceworkflow.go`, `internal/graphroute/graphroute.go:429` | `ListLiveRoots` | source-workflow anchor | yes | no |
| `gc.source_store_ref` | `internal/sourceworkflow/sourceworkflow.go`, `internal/graphroute/graphroute.go:431` | cross-store singleton | source-workflow anchor | yes | no |
| `gc.run_target` | `internal/graphroute/graphroute.go:427` | `internal/api/orders_feed.go:419` | projection target | yes | no |
| `gc.output_json` | `internal/dispatch/runtime.go:166,245`, `internal/dispatch/ralph.go:63`, `internal/dispatch/control.go:56,173` | downstream scope tests; projection | structured output payload | yes | no |
| `gc.output_json_required` | `internal/formula/graph.go:33`, `internal/formula/ralph.go:107,145,263` | fanout output parsing | compile-time flag | yes | no |
| `gc.outcome` | `internal/dispatch/retry.go:266-272`, `internal/dispatch/control.go:189`, convoy close-all | `internal/dispatch/retry.go:229`, `internal/api/handler_convoy_dispatch.go:487` | verdict | yes | no |
| `gc.step_id` | `internal/formula/retry.go:70,89`, `internal/dispatch/control.go:350,400` | `internal/dispatch/control.go`, `internal/dispatch/runtime.go:685` | logical step id | **no** | **yes — add** |
| `gc.step_ref` | `internal/molecule/molecule.go`, `internal/molecule/graph_apply.go`, `internal/dispatch/ralph.go` rewrite | `internal/dispatch/runtime.go`, `internal/dispatch/fanout.go`, `internal/dispatch/ralph.go` | step reference | **no** | **yes — add (this was one of the keys flagged in the UI review)** |
| `gc.ralph_step_id` | `internal/formula/ralph.go:100,140,199`, `internal/dispatch/control.go:357,402` | `internal/dispatch/runtime.go:686`, `internal/molecule/molecule.go:954` | ralph-owned logical id | **no** | **yes — add** |
| `gc.logical_bead_id` | `internal/molecule/graph_apply.go`, `internal/molecule/molecule.go`, `internal/dispatch/ralph.go` | `internal/dispatch/runtime.go:454,661`, `internal/dispatch/fanout.go:369` | subject ↔ attempt linkage | **no** | **yes — add** |
| `gc.spec_for` | `internal/formula/source_spec.go:27`, `internal/dispatch/control.go:795` | `internal/dispatch/control.go:774` | spec → step | **no** | **yes — add** |
| `gc.spec_for_ref` | `internal/formula/source_spec.go:28,58`, `internal/dispatch/control.go:796` | `internal/dispatch/control.go:769` | namespaced spec → step | **no** | **yes — add** |
| `gc.step_timeout` | `internal/dispatch/control.go:437` | `internal/dispatch/ralph.go:172`, `internal/molecule/molecule.go:817` | per-step timeout | **no** | **yes — add** |
| `gc.check_timeout` | formula compile / retry | `internal/dispatch/ralph.go:179`, `internal/molecule/molecule.go:817` | per-check timeout | **no** | **yes — add** |
| `gc.check_mode` | formula compile | `internal/dispatch/ralph.go:22` | check exec mode | **no** | **yes — add** |
| `gc.check_path` | formula compile | `internal/dispatch/ralph.go:138` | check script path | **no** | **yes — add** |
| `gc.city_path` | formula compile / propagation | `internal/dispatch/ralph.go:144` | absolute city path | **no** | **yes — add** |
| `gc.work_dir` | formula compile / convoy dispatch | `internal/dispatch/ralph.go:150` | check workdir | **no** | **yes — add** |
| `gc.terminal` | `internal/dispatch/ralph.go:348` (clear) | `internal/dispatch/ralph.go:19` | terminal marker | **no** | **yes — add** |
| `gc.attempt` | `internal/formula/retry.go`, `internal/formula/ralph.go`, `internal/dispatch/ralph.go`, `internal/dispatch/control.go` | many | attempt counter | **no** (mentioned in bead-fo-64m9x context as one of the missed keys) | **yes — add** |
| `gc.max_attempts` | `internal/dispatch/control.go:415,430` | `internal/dispatch/ralph.go:30`, `internal/dispatch/control.go:23,128` | retry bound | **no** (also mentioned in context) | **yes — add** |
| `gc.next_attempt` | `internal/dispatch/ralph.go:95,114` | same | next-attempt hint | **no** | **yes — add** |
| `gc.failed_attempt` | `internal/dispatch/ralph.go:76`, `internal/dispatch/control.go:74,190,224,238` | cleared via ephemera set | which attempt failed | **no** | **yes — add** |
| `gc.closed_by_attempt` | `internal/dispatch/retry.go:64,79,99,116` | `internal/dispatch/retry.go:33` | stale-attempt guard | **no** | **yes — add** |
| `gc.retry_count` | `internal/dispatch/retry.go:183` | — | independent retry counter | **no** | **yes — add** |
| `gc.retry_from` | `internal/dispatch/ralph.go:286,317,347,482` | — | retry-chain pointer | **no** | **yes — add** |
| `gc.retry_state` | `internal/dispatch/ralph.go:94,113` | `internal/dispatch/ralph.go:90,106` | retry state machine | **no** | **yes — add** |
| `gc.retry_session_recycled` | `internal/dispatch/retry.go:164` | `internal/dispatch/retry.go:157` | session-recycle flag | **no** | **yes — add** |
| `gc.partial_retry` | `internal/dispatch/ralph.go:1113` | `internal/dispatch/ralph.go:952` | partial-retry flag | **no** | **yes — add** |
| `gc.on_exhausted` | `internal/dispatch/control.go:418,420` | `internal/dispatch/control.go:27`, `internal/dispatch/retry.go:20` | retry-exhausted policy | **no** | **yes — add** |
| `gc.control_epoch` | `internal/molecule/molecule.go:292`, formula compile, `internal/dispatch/control.go:416,431` | `internal/dispatch/control.go:301`, `internal/molecule/molecule.go:247` | optimistic concurrency | **no** | **yes — add** |
| `gc.original_kind` | `internal/formula/retry.go:76,95` | — | original kind before rewrite | **no** | **yes — add** |
| `gc.attempt_log` | `internal/dispatch/control.go:973` | `internal/dispatch/control.go:942` | per-attempt JSON log | **no** | **yes — add** |
| `gc.controller_error` | `internal/dispatch/control.go:109,208` | — | controller-level error | **no** | **yes — add** |
| `gc.failure_class` | `internal/dispatch/retry.go:267-273`, `internal/dispatch/control.go:75,225,239` | `internal/dispatch/retry.go:232,237` | transient vs hard | **no** | **yes — add** |
| `gc.failure_reason` | `internal/dispatch/retry.go:185,262`, `internal/dispatch/control.go:76,226,240` | `internal/dispatch/retry.go:232,253` | free-text reason | **no** | **yes — add** |
| `gc.final_disposition` | `internal/dispatch/retry.go:65,83,103,120`, `internal/dispatch/control.go:77,110,209,227,241` | — | terminal verdict | **no** | **yes — add** |
| `gc.last_failure_class` | `internal/dispatch/retry.go:184` | — | most-recent class | **no** | **yes — add** |
| `gc.exit_code` | `internal/dispatch/ralph.go:216-218` | — | check exit code | **no** | **yes — add** |
| `gc.stdout` | `internal/dispatch/ralph.go:210` | — | check stdout | **no** | **yes — add** |
| `gc.stderr` | `internal/dispatch/ralph.go:211` | — | check stderr | **no** | **yes — add** |
| `gc.duration_ms` | `internal/dispatch/ralph.go:212` | — | check wall-clock ms | **no** | **yes — add** |
| `gc.truncated` | `internal/dispatch/ralph.go:213` | — | capture-truncated flag | **no** | **yes — add** |
| `gc.for_each` | formula compile | `internal/dispatch/fanout.go` | fanout template | yes (grouped) | no |
| `gc.bond` | formula compile | fanout processor | bond identity | yes (grouped) | no |
| `gc.bond_vars` | formula compile | fanout processor | bond variables | yes (grouped) | no |
| `gc.fanout_mode` | formula compile | fanout processor | fanout mode | yes (grouped) | no |
| `gc.fanout_state` | fanout processor | fanout processor | fanout runtime state | yes | no |
| `gc.spawned_count` | `internal/dispatch/fanout.go:173` | — | fanout child count | **no** | **yes — add** |
| `gc.partial_fragment` | `internal/dispatch/fanout.go:398` | `internal/dispatch/fanout.go:193` | partial-fanout flag | **no** | **yes — add** |
| `gc.dynamic_fragment` | `cmd/gc/cmd_convoy_dispatch.go:302` | `internal/dispatch/ralph.go:603,648,1073` | runtime-expanded fragment | **no** | **yes — add** |
| `gc.workflow_id` | `cmd/gc/cmd_convoy_dispatch.go:1296`, `internal/api/handler_convoy_dispatch.go:69`, `internal/api/huma_handlers_convoys.go:511,649` | `internal/api/convoy_event_stream.go:278,369`, `internal/api/convoy_sql.go:454`, `cmd/gc/cmd_convoy_dispatch.go:1270`, `internal/api/handler_convoy_dispatch.go:215` | logical workflow id | **no** | **yes — add** |
| `gc.session_affinity` | — (none found) | — | pin bead to session | yes | **evidence inconclusive — verify** |
| `gc.template` | session manager | `internal/agentutil/pool.go:59` | session-bead template id | **no** | **yes — add (handbook should note: written on `type=session` beads)** |
| `gc.formula_name` | — (none found) | `internal/api/orders_feed.go:405` | workflow display name | **no** | **yes — verify then add, or remove the reader (§13)** |
| `gc.source_step_spec` | — (none in non-test code) | `internal/dispatch/control.go:254` | serialized step spec | **no** | vestigial — document as deprecated (§14) |

---

## 13. Gaps flagged for handbook update

### 13.1. Concrete rows to add to `metadata-conventions.md`

Under the "Graph.v2 workflow (gascity-only contract)" block, add:

```
| `gc.step_id` | formula compile; control.go retry synthesis | dispatch/runtime/control | logical step id (stable across retries) |
| `gc.step_ref` | molecule cook; ralph retry rewrite | dispatch runtime, fanout correlation | runtime step reference |
| `gc.ralph_step_id` | formula compile; control.go ralph synthesis | dispatch runtime, molecule | ralph-owned step id |
| `gc.logical_bead_id` | molecule cook; ralph retry | dispatch runtime, fanout | ties attempt bead to logical subject |
| `gc.spec_for`, `gc.spec_for_ref` | `internal/formula/source_spec.go`; `internal/dispatch/control.go` | control dispatcher spec lookup | link `gc.kind=spec` bead to its subject step |
| `gc.scope_kind` | `internal/graphroute/graphroute.go:435` | `internal/api/convoy_sql.go:280`, convoy dispatch | scope kind for projection |
| `gc.root_store_ref` | `internal/graphroute/graphroute.go:424`, molecule cook | molecule cook (propagation) | store-relative ref to root |
| `gc.workflow_id` | `cmd/gc/cmd_convoy_dispatch.go:1296`, api handlers | convoy event stream, SQL, dispatch | logical workflow id (distinct from root bead id) |
| `gc.run_target` — already listed, but note it's written on the **root** step only (`internal/graphroute/graphroute.go:427`), not every step |
```

Add a new **"Exec output"** sub-block (these are all written by
ralph after a check runs):

```
**Exec output (written by ralph on check completion)**

| Key | Purpose |
|---|---|
| `gc.exit_code` | decimal string; `""` if no exit code (signal death) |
| `gc.stdout` | captured stdout (truncated, see `gc.truncated`) |
| `gc.stderr` | captured stderr (truncated, see `gc.truncated`) |
| `gc.duration_ms` | wall-clock duration in milliseconds |
| `gc.truncated` | `"true"` / `"false"` — whether stdout/stderr was truncated |
| `gc.terminal` | `"true"` marks a check as non-retryable |
| `gc.step_timeout`, `gc.check_timeout` | Go duration strings — per-step / per-check timeout overrides |
| `gc.check_mode` | currently only `"exec"` |
| `gc.check_path` | absolute path to the check script |
| `gc.city_path` | absolute city path (propagated from ancestors) |
| `gc.work_dir` | working directory (also accepted under the unprefixed `work_dir` key) |
```

Add a new **"Retry / control loop"** sub-block:

```
**Retry / control loop**

Keys below drive the bounded retry loop and classify outcomes. Most
are cleared from the subject bead before each retry (see
`clearRetryEphemera` at `internal/dispatch/ralph.go:852-883`).

| Key | Purpose |
|---|---|
| `gc.attempt` | current attempt index, 1-based |
| `gc.max_attempts` | upper bound (from formula `retry.max_attempts`) |
| `gc.next_attempt` | transient hint during `spawning`→`spawned` transition |
| `gc.failed_attempt` | which attempt failed (written on failure) |
| `gc.closed_by_attempt` | stale-attempt guard |
| `gc.retry_count` | independent retry counter (distinct from `gc.attempt`) |
| `gc.retry_from` | previous attempt's bead id |
| `gc.retry_state` | `spawning` \| `spawned` (ralph retry control state) |
| `gc.retry_session_recycled` | `"true"` once the session is recycled for this subject |
| `gc.partial_retry` | `"true"` if this attempt retries a fanout subset |
| `gc.on_exhausted` | `"hard_fail"` (default) \| `"soft_fail"` — policy when attempts exhausted |
| `gc.control_epoch` | optimistic-concurrency guard on molecule attach |
| `gc.original_kind` | kind before a `task`→`retry-run` rewrite |
| `gc.attempt_log` | JSON array — per-attempt structured log |
| `gc.controller_error` | controller-level error (distinct from attempt failure) |
| `gc.failure_class` | `"transient"` \| `"hard"` |
| `gc.failure_reason` | free-text reason |
| `gc.final_disposition` | `"pass"` \| `"soft_fail"` \| `"hard_fail"` \| `"controller_error"` |
| `gc.last_failure_class` | most-recent `gc.failure_class` |
```

Add a new **"Fanout"** sub-block (or extend the existing fanout row):

```
**Fanout runtime state**

| Key | Purpose |
|---|---|
| `gc.spawned_count` | how many children a fanout spawned |
| `gc.partial_fragment` | `"true"` marks a bead as a subset of its siblings |
| `gc.dynamic_fragment` | `"true"` marks a step as dynamically expanded at runtime |
```

Add a note under "Session affinity / pool hints":

```
| `gc.template` | On a `type=session` bead — the agent template this session instance is for. Read by `findSessionNameByTemplate` to resolve qualified agent → session name. |
```

### 13.2. Add `gc.kind` value table (from §11)

Replace the single-row `gc.kind` entry with the full three-category
table from §11.

### 13.3. Add a `convergence.*` section

Either:

- Add a third top-level section "`convergence.*` — gascity
  convergence loop" after the `gc.*` section, with the table from
  §9. There are 28 keys + the `var.*` prefix.
- Or cross-link to a dedicated
  `handbook/reference/convergence-metadata.md` and just stub a one-
  paragraph pointer in `metadata-conventions.md`.

The second option is cleaner given the size.

### 13.4. Fix the `gc:session` vs `gc.session` typo

File a gascity issue (do not silently patch from the UI-docs side)
for `internal/agentutil/pool.go:52` using `"gc.session"` (dot)
instead of `"gc:session"` (colon). The dead code is shadowed by
`cmd/gc/session_name_lookup.go:146`, so this is latent — but anyone
who deletes the cmd/gc copy will re-introduce a regression unless
the label spelling is fixed first.

### 13.5. Decide on `gc.formula_name`

`internal/api/orders_feed.go:405` reads `gc.formula_name` as a
display-name fallback, but **no code writes it** in the current tree.
Two resolutions:

- If the projection is load-bearing: track down where the write was
  supposed to live (convoy dispatch? order dispatch?) and wire it.
- If the projection is no longer load-bearing: remove the read and
  rely on `root.Ref` / `root.ID` fallbacks.

Either way, flag in the handbook: do not advertise `gc.formula_name`
until resolved.

### 13.6. Verify `gc.session_affinity`

Currently listed in the handbook and referenced in stored memory
`phase-1-bead-reappears…`, but I did not find any `"gc.session_affinity"`
string literal or constant in the tree (ruled out by
`rg '"gc.session_affinity"'` yielding nothing). Either:

- The key exists under a constant name I missed.
- The feature is not yet wired; the handbook line is aspirational.

Before shipping the handbook update, verify whether a reconciler or
worker read-site exists. If not, demote to "proposed" or remove.

### 13.7. Update the gaps-audit §14.10 cross-link

The handbook cites
`gaps-audit.md §14.10 — metadata key proliferation` as the place
where the lack of a central registry is noted. The observations in
this doc (≈ 60 keys with no central enumeration, the typo, the dead
reader) should be folded into §14.10 or a new §14.10.x.

---

## 14. Deprecated / test-only / vestigial

### `gc.source_step_spec` — vestigial

Read at `internal/dispatch/control.go:254`, never written in non-test
code. The equivalent modern path cooks a `gc.kind="spec"` bead
instead. Source-spec tests at
`internal/formula/source_spec_test.go:36-77` explicitly assert that
the key is **empty** on current control beads. The read is a legacy
backstop. **Do not document as an active key.**

### `gc:message` label — removed

Legacy discriminator label for mail beads. Removed in gascity #862;
comment at `internal/mail/beadmail/beadmail.go:250-251,294-295` notes
"the legacy gc:message label supplement was removed". `bead.Type ==
"message"` is now the authoritative discriminator. **Do not include
in label documentation.**

### `internal/agentutil/pool.go:52` — dead code using wrong label

As noted in §13.4 — queries for label `"gc.session"` (dot); sessions
are tagged `"gc:session"` (colon). Function is shadowed elsewhere,
so the bug is latent.

---

## 15. Not bead metadata (disambiguation)

These are `gc.*`-looking identifiers that appear in the tree but are
**not** bead metadata. Flagging them explicitly so they are not
accidentally added to `metadata-conventions.md`:

### 15.1. OpenTelemetry metric / counter / histogram names

All defined in `internal/telemetry/recorder.go:74-143`. These are
OTel instrument names, not bead metadata keys. They appear in OTel
exporters, not in any `bead.Metadata[...]` lookup.

```
gc.agent.starts.total           gc.agent.stops.total
gc.agent.crashes.total          gc.agent.quarantines.total
gc.agent.idle_kills.total       gc.reconcile.cycles.total
gc.session.nudges.total         gc.config.reloads.total
gc.controller.lifecycle.total   gc.bd.calls.total
gc.sling.dispatches.total       gc.pool.spawns.total
gc.pool.removes.total           gc.mail.operations.total
gc.drain.transitions.total      gc.bead_store.healthy   (gauge)
gc.bd.duration_ms               gc.pool.check.duration_ms
gc.http.requests.total          gc.http.duration_ms
```

### 15.2. Telemetry log attributes (subprocess env)

`internal/telemetry/subprocess.go:14-22` — `gc.agent=<name>`,
`gc.rig=<rig>`, `gc.city=<path>` are OTel attributes appended to the
env var `OTEL_RESOURCE_ATTRIBUTES`. Not bead metadata.

### 15.3. Contract file keys (TOML)

`internal/beads/contract/files.go:121-521` references
`gc.endpoint_origin` and `gc.endpoint_status`. These are **keys in
a TOML-like configuration file** read/written by the contract
subsystem (`ReadEndpointStatus`, `WriteContractState`). They are
stored **on disk**, not on a bead. Not bead metadata.

### 15.4. Completion / test binary / log file names

`cmd/gc/cmd_shell.go:172,176` — `gc.bash` / `gc.fish` are shell
completion **filenames** (in a completion directory). Not metadata.

`cmd/gc/test_guard.go:9` — comment about the Go test binary naming
convention (`gc.test`). Not metadata.

`examples/gastown/maintenance_scripts_test.go:47,666,720` — `gc.log`
is a filename used inside a test's tempdir. Not metadata.

### 15.5. Version / contract identifiers (string tokens)

- `gc.healthz.v1` — contract version string for the healthz workflow,
  defined at `internal/workspacesvc/workflow_healthz.go:14` and
  referenced in `internal/config/service_test.go:11`. It's the value
  of a contract/version string, not a metadata key on a bead.
- `gc.worker.conformance.v1` — schema version for the worker
  conformance report, `internal/worker/workertest/report.go:12`.
  Again, a version token, not a bead metadata key.

### 15.6. Pack-specific (gastown) verdict keys

Cleared by `clearRetryEphemera` at `internal/dispatch/ralph.go:877-879`
but **written by gastown user scripts**
(`examples/gastown/packs/gastown/assets/scripts/checks/*.sh`):

- `review.verdict`
- `design_review.verdict`
- `code_review.verdict`

Mention them in the gastown-integration doc, not the
metadata-conventions handbook (which is supposed to document gascity's
own keys).

---

## Final note on methodology

This pass found roughly **60 `gc.*` metadata keys** in active use
(versus 25 listed in the handbook). The handbook was accurate on the
keys it did mention — no outright wrong entries — but the coverage
was about 40%. The biggest misses were:

- The entire **retry / control-loop** cluster (~20 keys).
- The entire **exec output** cluster (6 keys).
- The entire **step-identity** cluster (`gc.step_id`, `gc.step_ref`,
  `gc.ralph_step_id`, `gc.logical_bead_id`, `gc.spec_for*`).
- The `gc.kind` value table was only ~55% complete (missing
  `retry-eval`, `scope`, `spec`, `task`, `run`, `cleanup`, `retry-run`).
- The `convergence.*` namespace (28 keys) is missing entirely.

These are all recorded in §12 and §13 with precise edits.

# Metadata conventions

Beads stores a JSON column `metadata` per bead. Schema-wise it's
unconstrained: any well-formed JSON is legal
(`internal/types/types.go:248-252`). Convention — not code — assigns
meaning to keys. This doc catalogs the conventions both orchestrators
share and each orchestrator's unique keys.

The gascity `gc.*` coverage here is derived from the deep-dive at
[../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md);
see that doc for writer/reader citations per key and for the
gascity-specific `convergence.*` namespace (tracked separately in
[convergence-metadata.md](convergence-metadata.md)).

## Querying metadata

- `bd list --metadata-field key=value` — top-level key=value match
  (AND across multiple).
- `bd list --has-metadata-key key` — existence check.
- `bd query "metadata.key = 'value'"` — DSL form.

Keys with dots need JSON-path quoting; beads's `JSONMetadataPath`
(`internal/storage/metadata.go:226-231`) handles this — `gc.routed_to`
becomes SQL-path `$."gc.routed_to"`.

## Key naming rules

`ValidateMetadataKey` (`internal/storage/metadata.go:215-220`) requires
keys match `^[a-zA-Z_][a-zA-Z0-9_.]*$`. Spaces and most punctuation are
rejected. Dots are allowed inside keys for namespacing (e.g.
`gc.routed_to`).

## Optional schema validation

`bd config set metadata.validation <mode>` where mode is `none`
(default), `warn`, or `error`. When enabled, metadata is validated
against configured field types defined via `metadata.schema.*` keys in
config. Supported field types: `string`, `int`, `float`, `bool`,
`enum`.

## `gc.*` — gascity

Roughly 60 `gc.*` keys live in active gascity code, organized by
purpose below. The deep-dive at
[../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md)
has the full per-key writer/reader audit.

### Dispatch / routing

| Key | Written by | Consumed by |
|---|---|---|
| `gc.routed_to` | `gc sling` router (`internal/sling/sling_attachment.go`); graph.v2 step decoration (`internal/graphroute/graphroute.go`); molecule cook | worker `work_query` tier 3; `internal/api/orders_feed.go` workflow projection |
| `gc.execution_routed_to` | `internal/graphroute/graphroute.go` `AssignGraphStepRoute` on control divert | `internal/api/orders_feed.go:419` projection fallback |

`gc.routed_to` is the single most load-bearing signal: workers poll
`bd ready --metadata-field gc.routed_to=<my-pool> --unassigned` to
find work.

### Molecules / wisps

| Key | Purpose |
|---|---|
| `gc.continuation_group` | Groups wisps of the same continuation so the convergence loop processes them together |
| `gc.idempotency_key` | Wisp/molecule duplicate prevention; stamped by `molecule.Cook` |
| `gc.deferred_assignee` | `DeferAssignees` mode holds the assignee here until reconciler reveal |
| `gc.deferred_routed_to` | Same, for routing target |
| `gc.deferred_execution_routed_to` | Same, for original execution route |
| `gc.deferred_type` | Same, for bead type |
| `molecule_id` | Ties a work bead to its attached wisp/molecule root. Written by sling on wisp attach; checked by the pool-worker prompt to branch between "follow molecule steps" and "execute description." |

Constants for `gc.deferred_*` live at
`internal/molecule/molecule.go:57-72`.

### Graph.v2 workflow topology

Keys set by formula compile and graph-route decoration; consumed by
the control dispatcher and reconciler.

| Key | Purpose |
|---|---|
| `gc.kind` | Step classification — see value table below |
| `gc.formula_contract` | `"graph.v2"` marks a root as a graph-v2 workflow (`internal/graphroute/graphroute.go:84`) |
| `gc.parent` | Molecule parent pointer (distinct from `bead.ParentID`) |
| `gc.root_bead_id` | Subtree anchor — the molecule/workflow root's bead id |
| `gc.root_store_ref` | Same, but in store-relative-ref form (human-readable). Propagated during cook at `internal/molecule/molecule.go:230,262` |
| `gc.source_bead_id` | Source bead that launched this workflow (convoy head, source-workflow, etc.) |
| `gc.source_store_ref` | Same, ref form — used by cross-store singleton checks (`ListLiveRoots`) |
| `gc.control_for` | Control bead → subject step linkage (step id) |
| `gc.scope_ref` | Scope-check subject step id |
| `gc.scope_role` | Role within a scope (subject / check / …) |
| `gc.scope_name` | Scope's own name |
| `gc.scope_kind` | Scope kind (graph, convergence, …). Read by convoy projection at `internal/api/convoy_sql.go:280` and `internal/api/handler_convoy_dispatch.go:336` |
| `gc.on_fail` | Scope-check failure policy (`"soft_fail"` / `"hard_fail"`) |
| `gc.run_target` | Canonical "this workflow runs on this pool"; written on the **root** step only (`internal/graphroute/graphroute.go:427`) |
| `gc.workflow_id` | Logical workflow identifier (distinct from `gc.root_bead_id`); shared across reruns of the same workflow. Written during convoy dispatch (`cmd/gc/cmd_convoy_dispatch.go:1296`) and API-driven dispatch |
| `gc.output_json` | Structured output payload when a step completes with structured output |
| `gc.output_json_required` | Compile-time flag marking steps that must produce structured output |
| `gc.outcome` | Verdict on a control-bead kind (`pass` / `fail` / `skipped`) |

#### `gc.kind` values

Verified against `internal/graphroute/graphroute.go:55-75` and
`internal/formula/types.go:947-951`:

| Category | Values | Routed? |
|---|---|---|
| Control dispatcher | `check`, `fanout`, `retry-eval`, `scope-check`, `workflow-finalize`, `retry`, `ralph` | Diverted to control-dispatcher agent |
| Workflow topology | `workflow`, `scope`, `spec` | Not routed — structure only |
| Work (runnable) | `task`, `run`, `cleanup`, `retry-run` | Routed to work pools |

### Step identity

Drive retry correlation and fanout attempt tracking.

| Key | Purpose |
|---|---|
| `gc.step_id` | Logical step identifier (formula-level, stable across retries) |
| `gc.step_ref` | Runtime step reference — written on all step beads for fanout/retry correlation; rewritten by `rewriteRetryStepRef` on ralph retry (`internal/dispatch/ralph.go:288`) |
| `gc.ralph_step_id` | Ralph-owned logical step id (vs. plain retry) |
| `gc.logical_bead_id` | Ties a concrete (attempt) bead back to its stable logical subject |
| `gc.spec_for` | On `gc.kind="spec"` beads — raw subject step id |
| `gc.spec_for_ref` | Namespaced form used after fanout expansion |

### Fanout runtime state

Fanout compilation keys plus runtime state written by the fanout
processor (`internal/dispatch/fanout.go`).

| Key | Purpose |
|---|---|
| `gc.for_each` | Fanout template — JSON array or template reference |
| `gc.bond` | Post-fanout bond identity |
| `gc.bond_vars` | JSON-encoded variable set for the bond |
| `gc.fanout_mode` | Execution mode (parallel / sequential / …) |
| `gc.fanout_state` | Runtime state of the fanout |
| `gc.spawned_count` | How many children the fanout spawned |
| `gc.partial_fragment` | `"true"` — this fanout bead represents a subset of siblings (retry on a subset) |
| `gc.dynamic_fragment` | `"true"` — step was dynamically expanded at runtime (not compile time) |

### Retry / control loop

Keys driving the bounded retry loop. Most are cleared from the
subject bead before each retry via `clearRetryEphemera`
(`internal/dispatch/ralph.go:852-883`).

| Key | Purpose |
|---|---|
| `gc.attempt` | Current attempt index (1-based) |
| `gc.max_attempts` | Upper bound (from formula `retry.max_attempts`) |
| `gc.next_attempt` | Transient hint during `spawning`→`spawned` transition |
| `gc.failed_attempt` | Which attempt failed (written on failure) |
| `gc.closed_by_attempt` | Stale-attempt guard; convergence loop skips attempts closed by an earlier one |
| `gc.retry_count` | Independent retry counter (distinct from `gc.attempt`) |
| `gc.retry_from` | Previous attempt's bead id — lets observers walk the retry chain |
| `gc.retry_state` | Ralph retry control state — `spawning` or `spawned` |
| `gc.retry_session_recycled` | Once-per-subject flag: session has been recycled for this subject |
| `gc.partial_retry` | `"true"` — this attempt retries a fanout subset |
| `gc.on_exhausted` | Policy when attempts exhausted — `"hard_fail"` (default) or `"soft_fail"` |
| `gc.control_epoch` | Optimistic-concurrency guard on molecule attach beads |
| `gc.original_kind` | Kind before a `task`→`retry-run` rewrite |
| `gc.attempt_log` | JSON array — per-attempt structured log (`internal/dispatch/control.go:973`) |
| `gc.controller_error` | Controller-level error (distinct from attempt failure) |
| `gc.failure_class` | `"transient"` (retryable) or `"hard"` (not) |
| `gc.failure_reason` | Free-text reason string |
| `gc.final_disposition` | Terminal verdict — `"pass"` / `"soft_fail"` / `"hard_fail"` / `"controller_error"` |
| `gc.last_failure_class` | Most-recent `gc.failure_class` (convenience for observers) |

### Exec output

Written by ralph when a check script completes
(`internal/dispatch/ralph.go:209-218`). All cleared before the next
retry.

| Key | Purpose |
|---|---|
| `gc.exit_code` | Decimal string; `""` if the process exited without a code (signal death) |
| `gc.stdout` | Captured stdout (truncated — see `gc.truncated`) |
| `gc.stderr` | Captured stderr (truncated) |
| `gc.duration_ms` | Wall-clock duration (milliseconds, decimal string) |
| `gc.truncated` | `"true"` / `"false"` — whether capture was truncated |
| `gc.terminal` | `"true"` marks a check as non-retryable |
| `gc.step_timeout` | Go duration — per-step timeout override |
| `gc.check_timeout` | Go duration — per-check timeout override |
| `gc.check_mode` | Currently only `"exec"` |
| `gc.check_path` | Absolute path to the check script |
| `gc.city_path` | Absolute city path (propagated from ancestors via `resolveInheritedMetadata`) |
| `gc.work_dir` | Working directory (also accepted under unprefixed `work_dir`) |

### Session affinity / pool hints

| Key | Purpose |
|---|---|
| `gc.template` | On a `type=session` bead — the agent template this session instance is for. Read by `findSessionNameByTemplate` (`internal/agentutil/pool.go:59`) to resolve qualified agent → session name. |
| `gc.session_affinity` | **Unverified** — string literal not found in the current gascity tree. Either exists under a constant name, or was removed, or is aspirational. Do not advertise until a writer is located. See [../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md) §13.6. |

### Incomplete / flagged for resolution

| Key | Status |
|---|---|
| `gc.formula_name` | Reader at `internal/api/orders_feed.go:405` but **no writer in the current tree**. Either the write path was removed (remove the read) or the feature is unwired (wire the writer). See [../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md) §13.5. |
| `gc.source_step_spec` | Legacy backstop read at `internal/dispatch/control.go:254`; never written in current non-test code. Replaced by `gc.kind="spec"` beads. **Vestigial.** |

## `convergence.*` — gascity

gascity owns a **second** metadata namespace, `convergence.*`, used
by the convergence-loop primitive (28 keys plus a `var.*` prefix).
Full catalog: [convergence-metadata.md](convergence-metadata.md).

## `gt:*` — gastown

Gastown's conventions live across **three substrates** — labels,
description fields inside `bead.description`, and a single metadata
column entry. Full per-bead-kind catalog:
[gastown-conventions.md](gastown-conventions.md).

The top-level labels (bead-kind discriminators):

| Label | On what bead |
|---|---|
| `gt:agent` | Agent bead (persistent identity; `role_type` field distinguishes polecat / witness / refinery / deacon / mayor / crew / dog). |
| `gt:channel` | Channel bead (broadcast pub/sub). |
| `gt:escalation` | Escalation bead (ephemeral, severity-scoped). |
| `gt:group` | Mail distribution group bead. |
| `gt:message` | Mail message bead (large label family — see gastown-conventions.md). |
| `gt:merge-request` | MR bead. |
| `gt:merge-slot` | Per-rig merge mutex bead (JSON description). |
| `gt:queue` | Generic queue bead. |
| `gt:rig` | Rig identity bead. |
| `gt:sling-context` | Scheduler ephemeral context bead (JSON description). |

Dynamic discriminators: `gt:<issue-type>` produced automatically —
`gt:bug`, `gt:epic`, `gt:task`, `gt:molecule`, `gt:wisp` all exist
via `"gt:" + issueType` at `gastown/internal/beads/beads.go:1061`.

Protected beads: `IsProtectedBead` gates automated status changes
against `gt:standing-orders`, `gt:keep`, `gt:role`, `gt:rig`. UIs
should suppress auto-close actions on these.

Additional role / severity labels:

- `role_type:dog` — on a `gt:agent` bead, dog vs. polecat / witness /
  refinery / crew. Note `role_type` is ALSO a description field on
  non-dog agents; dual-representation. See
  [gastown-conventions.md](gastown-conventions.md#dual-representation-gotcha-role_type).
- `severity:critical` / `high` / `medium` / `low` — on escalation
  beads.
- `status:docked`, `status:parked` — rig lifecycle.
- `mountain`, `mountain:paused`, `mountain:failures:<N>`,
  `mountain:skipped` — convoy "mountain" workflow state.

Gastown additionally stores structured data in **description fields**
(`key: value` lines inside `bead.description`) — ~65 keys across the
11 bead kinds. `internal/beads/fields.go` is the parser. See
[gastown-conventions.md](gastown-conventions.md#substrate-description-fields)
for the per-kind catalog. Two bead kinds (`gt:merge-slot`,
`gt:sling-context`) use **JSON** descriptions instead of key:value —
a UI parser must detect which format applies.

### Gastown metadata column

Gastown uses the `metadata` column for exactly one convention:

| Key | Purpose |
|---|---|
| `delegated_from` | JSON `Delegation` record on a delegated-to bead. Written by `AddDelegation` (`gastown/internal/beads/beads_delegation.go:72`); read by `GetDelegation`. Details: [gastown-conventions.md](gastown-conventions.md#substrate-metadata-column). |

There is no `gt.*` metadata namespace. Everything else that would be
`gc.*` metadata in gascity is a description-field key in gastown.

## Gascity label conventions

Distinct from `gc.*` metadata keys. Written and consumed by gascity
subsystems. Full list per [../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md)
§10. (Contrast with gastown — [gastown-conventions.md](gastown-conventions.md)
for the full gastown picture.)

### Session / wait / nudge

| Label | On what bead |
|---|---|
| `gc:session` | Session bead — one per running session. Constant `sessionBeadLabel` / `LabelSession`. |
| `gc:wait` | Session wait bead — tracks a session's wait state. |
| `gc:nudge` | Nudge bead — one per in-flight nudge. |

### External messaging (`gc:extmsg-*`)

Defined in `internal/extmsg/labels.go:11-18`. One base label per bead
kind plus content-hashed companions for indexed lookup.

| Label | Purpose |
|---|---|
| `gc:extmsg-binding` | Maps a gascity session to an external conversation |
| `gc:extmsg-delivery` | Outbound message delivery bead |
| `gc:extmsg-group` | Group bead (extmsg-level group identity) |
| `gc:extmsg-group-participant` | Participant bead within a group |
| `gc:extmsg-membership` | Membership bead (which sessions are in a conversation) |
| `gc:extmsg-transcript` | Transcript bead |
| `gc:extmsg-transcript-state` | Transcript state bead |

Companion hashed labels (SHA-256 over normalized conversation-ref
fields, defined at `internal/extmsg/labels.go:20-33`):
`extmsg:binding:*`, `extmsg:delivery:*`, `extmsg:group:*`,
`extmsg:transcript:*`, `extmsg:membership:*`. These are content-hashed
join keys — opaque to humans; a UI should render them as "extmsg join
key" badges rather than the hash.

### Routing / topology

| Label | Written by | Purpose |
|---|---|---|
| `pool:<target>` | `internal/sling/sling_attachment.go:381` | Pins a bead to a specific pool; sling manages these (stale `pool:*` removed before new add) |
| `agent:<name>` | `cmd/gc/session_beads.go:715`, etc. | Which configured agent template a bead belongs to |
| `nudge:<id>` | `cmd/gc/nudge_beads.go:46`, `internal/nudgequeue/waits.go:85` | Joins a nudge bead to its target |
| `session:<id>` | `internal/session/waits.go:90`, `cmd/gc/cmd_wait.go:211` | Joins a wait bead to a session |
| `thread:<id>` | `internal/mail/beadmail/beadmail.go:35,155` | Mail thread id |
| `reply-to:<id>` | `internal/mail/beadmail/beadmail.go:160` | On a mail reply bead — which bead it replies to |
| `priority:<0-9>` | `internal/mail/beadmail/beadmail.go:338` | Mail priority (extracted via `extractPriority`) |
| `order:<scoped-name>` | `cmd/gc/order_dispatch.go:199` | Order identity + tracking bead |
| `order-run:<scoped-name>` | `cmd/gc/order_dispatch.go:200,348,412` | One-off order run instance |
| `order-tracking` | `cmd/gc/order_dispatch.go:20` | Marks the persistent tracking bead for an order |
| `wisp` / `wisp-canceled` / `wisp-failed` | `cmd/gc/order_dispatch.go:297,319,341,369,380` | Wisp lifecycle on order tracking beads |
| `owned` | `cmd/gc/cmd_convoy.go:181`, `internal/sling/sling_core.go:299` | Convoy opt-out from auto-close |
| `gate:<json>` / `gate:<wait-id>` | `internal/formula/compile.go:341`, `internal/formula/controlflow.go:540` | Graph.v2 gate metadata serialized onto the target step |
| `loop:<json>` | `internal/formula/controlflow.go:200` | Loop metadata on the first step of an expanded conditional loop |

### Legacy / removed

- **`gc:message`** — removed in gascity #862. `bead.Type == "message"`
  is the authoritative discriminator now. Do not use.

## `molecule_id` (not namespaced but gascity-owned)

Written by sling attachment when a wisp is attached to a work bead.
The pool-worker prompt uses this to decide between "follow molecule
steps" and "execute the description." Technically a metadata key, but
its value is an issue ID, not a string.

## Labels as metadata

Many orchestrator conventions use **labels** where they could use
metadata. Labels are:

- Free-form strings up to 50 chars.
- Stored in the `labels` table (one row per bead-label pair).
- Queryable with `--label` (AND), `--label-any` (OR),
  `--label-pattern`, `--label-regex`.
- Cheap indexes make label queries fast.

Rule of thumb:

- Use **labels** for simple yes/no discriminators (`read`,
  `thread:<id>`, `gt:agent`).
- Use **metadata** for structured values (`gc.routed_to`,
  `gc.idempotency_key`) or namespaces with multiple sub-keys.

## No central registry

There's no `package gcmeta` or `constants.go` that enumerates every
well-known key. Keys are introduced per-subsystem; the deep-dive
at [../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md)
is the closest thing to an authoritative catalog.

See [../../gaps-audit.md](../../gaps-audit.md) §14.10 and
[../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md) §13.7
for the central-registry observation and a recommended cleanup.

## Non-bead-metadata disambiguation

Several `gc.*`-prefixed identifiers in the gascity tree are **not**
bead metadata. Do not render them as such in a UI:

- **OpenTelemetry instrument names** (metrics, counters, histograms) —
  `gc.agent.starts.total`, `gc.reconcile.cycles.total`,
  `gc.bd.duration_ms`, etc. Defined in
  `internal/telemetry/recorder.go:74-143`. They live in OTel exporters,
  not `bead.Metadata`.
- **OTel resource attributes on subprocess env** — `gc.agent=<name>`,
  `gc.rig=<rig>`, `gc.city=<path>` appended to `OTEL_RESOURCE_ATTRIBUTES`.
- **Contract file keys (TOML)** — `gc.endpoint_origin`,
  `gc.endpoint_status` are keys in a TOML config file read by the
  contract subsystem (`internal/beads/contract/files.go`), not bead
  metadata.
- **Filenames / shell completion** — `gc.bash`, `gc.fish`, `gc.log`,
  `gc.test` are file paths in command output or test fixtures.
- **Version tokens** — `gc.healthz.v1`, `gc.worker.conformance.v1` are
  contract/schema version strings, not metadata keys.
- **Pack-specific verdict keys** — `review.verdict`,
  `design_review.verdict`, `code_review.verdict` are written by
  gastown pack check scripts, not by gascity. gascity only clears
  them in `clearRetryEphemera` so stale verdicts don't bleed across
  retries.

## UI recommendations

For a beads-ui surfacing metadata:

- **`gc.routed_to` is the ubiquity signal.** Show it prominently when
  present; it's "this bead is addressed to an agent pool."
- **`gc.continuation_group` identifies a wisp chain.** Group wisps
  that share it.
- **`gc.kind` classifies graph-v2 control beads.** Hide control beads
  from the default view or collapse them into their parent workflow.
- **`gt:agent` label marks agent beads.** Hide from default work
  views unless user explicitly asks for agents.
- **Retry-loop keys** (`gc.attempt`, `gc.max_attempts`, `gc.outcome`,
  `gc.final_disposition`) are critical for understanding what
  happened during an error path — surface in a bead-detail panel.
- **Exec-output keys** (`gc.exit_code`, `gc.stdout`, `gc.stderr`,
  `gc.duration_ms`) are rich debugging signals when a check has
  run. Surface in the bead-detail panel.
- **Metadata validation status** — if the project has
  `metadata.validation = error` set, show a badge for beads violating
  their configured schema.

See [../ui-review.md](../../ui-review.md) §2 for the convention-pack
model (orchestrator-specific render rules).

## See also

- [bead-schema.md](bead-schema.md#custom-metadata) — the `metadata`
  column.
- [dependency-types.md](dependency-types.md) — edge metadata
  conventions (`WaitsForMeta`, `AttestsMeta`).
- [convergence-metadata.md](convergence-metadata.md) —
  `convergence.*` namespace.
- [../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md)
  — per-key writer/reader citations.
- [../explanation/canonical-vs-vestigial.md](../explanation/canonical-vs-vestigial.md)
  — which conventions are load-bearing vs cosmetic.

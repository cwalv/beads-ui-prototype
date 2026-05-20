# 2026-05-20 — explanation-sweep (parallel audit)

## Scope

Iteration 6. Five-way parallel audit covering the six explanation
pages plus `convergence-metadata.md` and a strategic framing edit
on `gastown-conventions.md`. Seven files touched.

## Changes applied

### `handbook/explanation/the-pour-pipeline.md`

- Compilation pipeline: replaced stale `internal/formula/compile.go`
  with the real driver `cmd/bd/cook.go:676 resolveAndCookFormulaWithVars`;
  pinned each pipeline step to its actual transform function.
- Pour: cited `runPour` and `types.IDPrefixMol` (matching
  `cmd/bd/pour.go:216`).
- WISP TTL: line ref `types.go:667` → `:671`.
- Discovering running molecules: rewrote — `molecule`/`gate` are
  built-in (`types.go:531-532`), and the proto root IS stamped
  `IssueType: types.TypeMolecule` by `cookFormula`
  (`cook.go:445-456`) and copied by `cloneSubgraph`
  (`template.go:593`). The previous "removed from built-ins, won't
  auto-stamp" claim was doubly wrong.

### `handbook/explanation/the-store-architecture.md`

- Dolt-only backend: refreshed file:lines for the deprecated
  `Backend` field, const, and `GetBackend()` hard-return.
- Both tables / `CreateIssue`: updated routing logic refs,
  added `infra_types.go:7` for the default infra-type set, called
  out migration 0035 backfill, clarified that `molecule`/`gate`
  (built-in but non-infra) stay in `issues`.
- Migration system: **rewrote entirely**. Removed the false claim
  about `internal/storage/dolt/migrations/*.go` ("16 files") — that
  directory does not exist; there's a 16-line wrapper file. Corrected
  total count (61 → 39 up files, through 0039). Added a highlights
  list for migrations 0019, 0030, 0035, 0037 (incl. "issues.id is
  NOT touched" call-out), and 0038.

### `handbook/explanation/agent-coordination.md`

- Gate convention: `gate` is no longer custom; updated to reflect
  built-in status (no `types.custom` registration needed).
- Gate types table: clarified `mail` has no `bd gate check` case
  (falls through); cited `gate.go:842` for `bead` vestigial line.
- Mail consequences: added that `message` routes to `wisps` per
  migration 0035 — UIs querying `issues` directly miss messages.
- Gastown `gt sling`: removed stale claim that it sets `hook_bead`;
  cited `internal/cmd/sling_helpers.go:565-573` (no-op since
  hq-l6mm5); status=hooked + assignee is authoritative.
- Dropped the standalone `hook_bead` GUPP-rule bullet (no longer
  maintained).
- Canonical dispatch advice reworded against current gastown
  reality (status+assignee not `hook_bead`).

### `handbook/explanation/canonical-vs-vestigial.md`

- Custom types/statuses: corrected — `gate`, `molecule`, `message`,
  `event` are built-in (`types.go:530-547`); added the wisps-routing
  note for infra types (mig 0035).
- `bd merge-slot`: replaced false "Removed from bd v0.62+" with
  current state — subcommands still ship, but the model is unused
  by orchestrators. bd is v1.0.4.
- Recommendation §5 rewritten: canonical dispatch signal is
  `gc.routed_to`; gastown's fallback is status=hooked + assignee
  (not `hook_bead` slot).

### `handbook/explanation/beads-and-orchestrators.md`

No edits — gascity-side claims still hold against current code
(Store interface, `zero hardcoded roles` invariant, `[[agent]]`
config + `gc.routed_to` dispatch, packs, graph.v2 control beads,
event registry). Gastown-side claims preserved as conceptual
contrast even though gastown is pruned from this workspace.

### `handbook/explanation/why-beads.md`

- Polymorphism section: rewrote to reflect migration 0035 (issues +
  wisps are sibling tables sharing the row shape; `agent`/`rig`/
  `role`/`message` are built-in infra types routed to wisps).
- `bd compact --dolt` → `bd compact` (flag removed; the command IS
  the Dolt-history squasher).
- Dependencies: `20 well-known` → `19 well-known`; spelled out the
  four ready-work types instead of "sixteen informational".

### `handbook/reference/convergence-metadata.md`

No metadata-key drift — all 28 `Field*` constants in
`internal/convergence/metadata.go:12-40` are already documented.
Added a new disambiguation subsection cataloguing 6
`convergence.*` event-type strings (from
`internal/convergence/events.go:12-18`) that a reader could mistake
for metadata. These never appear as `bead.Metadata[k]=v` — only as
`EventEmitter.Emit(type, ...)`.

Final counts: 28 metadata keys documented (matches source exactly)
+ 6 event types in dedicated disambiguation = full coverage of the
34 unique `convergence.*` quoted literals in `internal/`.

### `handbook/reference/gastown-conventions.md`

**Strategic framing edit:** gastown has been pruned from the
foundations workspace, so the catalog can no longer be verified
against canonical sources here. Added a snapshot block at the top:
states the page is preserved for historical reference and as a
model of "how an orchestrator layers conventions on top of beads";
pins the bootstrap commit (`bdbe8c4b0e45f318576c838355fcc85b15e74b8f`)
and date (2026-04-23); cross-links to the live sister
`metadata-conventions.md`.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6

## Gaps deferred to a future run

- **`bd init --remote`** bootstrap path (`112be87f8`) — still not
  documented in `bd-commands.md`.
- **`bd dolt push/pull --remote`** flag (`73d72ec0f`) — still not
  documented.
- **`bd dep tree` GH#3565 changes** — referenced in
  dependency-types.md but not in bd-commands.md table row.
- **`json-outputs.md` per-command examples** — still in legacy
  shape; only matters once `BD_JSON_ENVELOPE=1` becomes default in
  v2.0.
- **gastown-side conventions** — not refreshable in this workspace;
  the snapshot note is the structural answer.

The handbook is broadly current against the tips after this sweep.
The remaining items above are small additions rather than drift
fixes.

## See also

- `handbook/explanation/the-pour-pipeline.md`
- `handbook/explanation/the-store-architecture.md`
- `handbook/explanation/agent-coordination.md`
- `handbook/explanation/canonical-vs-vestigial.md`
- `handbook/explanation/beads-and-orchestrators.md`
- `handbook/explanation/why-beads.md`
- `handbook/reference/convergence-metadata.md`
- `handbook/reference/gastown-conventions.md`

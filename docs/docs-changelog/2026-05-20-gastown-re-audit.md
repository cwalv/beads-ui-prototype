# 2026-05-20 — gastown re-audit (correcting a false-premise iteration)

## Scope

Iteration 9. Corrects a mistake from iteration 6's
`explanation-sweep`: I told three subagents "gastown has been
pruned from the foundations workspace" — which was wrong. gastown
is alive at `/home/cwa/weaveroot/foundations/github/gastownhall/gastown`
(tip `b1dc37c75dbd0404e81e024385d77115b908eafe`); it just hadn't
been pulled into *this workweave's* `rwv.yaml` (a separate
problem, now filed as [`fo-qb2er`](../../../../.beads)).

## Changes applied

### `handbook/reference/gastown-conventions.md`

- Removed the "Snapshot — preserved for historical reference" block
  added in iteration 6 (claimed gastown was pruned; wrong).
- Replaced with a one-paragraph "Verified 2026-05-20 against
  gastown tip `b1dc37c75dbd0404e81e024385d77115b908eafe`" note.
- Added a top-of-page storage note: `agent`/`rig`/`role`/`message`
  rows now live in `wisps` per beads migration 0035.
- Updated the `hook_bead` table row: external WRITE path is gone
  since hq-l6mm5 (`internal/cmd/sling_helpers.go:565-573`
  `updateAgentHookBead` is an explicit no-op); read sites still
  live in `beads.go:191`, `beads_agent.go:88-90,168`. Status=hooked
  + assignee on the work bead is now the authoritative dispatch
  signal.

### Catalog spot-check (no edits — all confirmed accurate)

- Three-substrate split (labels / description-fields / metadata
  column) — still exactly this shape.
- `delegated_from` remains the only `metadata` column convention.
- `IsProtectedBead` label set unchanged: `gt:standing-orders`,
  `gt:keep`, `gt:role`, `gt:rig` (verbatim at
  `internal/beads/beads.go:260`).
- 11 bead kinds enumerated all still present in `internal/beads/`.
  No new kinds added in the 15 commits since bootstrap.
- `fields.go` is still 1057 lines (size sanity check).
- Mail label set and two-phase delivery labels unchanged.
- Convoy / mountain workflow labels unchanged.
- `bd slot` v0.62 removal note already accurate.

### Iteration 6 edits to `agent-coordination.md` and `canonical-vs-vestigial.md` — left in place

Those edits were made under the same false premise but the
technical content held up against gastown source:

- `gt sling` no longer writing `hook_bead` is a real upstream change
  (hq-l6mm5).
- `bd merge-slot` still ships (bd v1.0.4); the iteration 6 edit
  reframed it as "vestigial-by-disuse" rather than "removed",
  matching current code.
- Canonical dispatch is `gc.routed_to` (gascity) with status=hooked +
  assignee as gastown's fallback — matches current gastown
  `internal/cmd/sling_helpers.go`.

No edits needed beyond the framing fix in gastown-conventions.md.

### Workweave manifest

Added `github/gastownhall/gastown` to this workweave's `rwv.yaml`
as `role: fork`. Mirrors primary's manifest entry. Worktree
integration (`rwv lock` / fetch) deferred — the docs-refresh sweep
only needs read-only access to gastown source, which works fine
via the primary path.

### Related bug

Filed [`fo-qb2er`](../../../../.beads): `rwv sync` should propagate
`rwv.yaml` manifest, not just `rwv.lock`. Two related surfaces:

1. `rwv add` from a workweave wrote to primary's manifest only;
   workweave's manifest didn't pick it up automatically.
2. `rwv sync` ignores `rwv.yaml` entirely.
3. Direct `git merge --ff-only` to propagate workweave commits up
   to primary's main (the workaround I've been using) bypasses rwv
   sync entirely — no manifest enforcement.

The user's framing: "we shouldn't be able to sync up to primary
without this [being] fixed, which we've done several times" — the
fact that ff'ing succeeds without rwv catching divergence is the
smell.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6
- gastown @ b1dc37c75dbd0404e81e024385d77115b908eafe (now in
  manifest)

## Self-correction note

Earlier iterations (2 through 8) carried lines like "gastown not in
current rwv.lock" in their changelog tips and gap-deferred sections.
Those were technically true at the time (this workweave's rwv.lock
didn't reference gastown) but were *framed* in a way that implied
gastown had been removed from foundations. Iteration 6 took that
framing literally and made structural edits. Iteration 9 (this
entry) fixes the framing where it produced bad doc state and
preserves the correct technical edits.

## Gaps deferred

- **Worktree integration for gastown in this workweave** — manifest
  entry exists; `git worktree add` and `rwv lock` to fully integrate
  is straightforward when needed.
- **`json-outputs.md` per-command examples** — still in legacy
  shape; only matters when v2.0 makes envelope mode default.

## See also

- `handbook/reference/gastown-conventions.md`
- `docs-changelog/2026-05-20-explanation-sweep.md` (the affected
  iteration)
- bead `fo-qb2er` for the rwv-sync manifest bug

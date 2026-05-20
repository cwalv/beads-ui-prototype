# 2026-05-20 — reference-sweep (parallel audit)

## Scope

Iteration 5. Five-way parallel audit across the handbook reference
pages, each scoped to one or two files. Each audit re-read the
corresponding canonical source at the current tips and applied
in-place edits where claims had drifted. Six files touched.

## Changes applied

### `handbook/reference/status-lifecycle.md`

- Updated Claim CAS condition: `status='open'` AND empty/self
  assignee — not just the assignee predicate previously documented.
- Added that `started_at` is auto-set on first claim (GH#2796,
  migration 0027 column).
- Re-cited Close (`dolt/issues.go:295-`) and Reopen
  (`dolt/issues.go:270-284`) — older ranges had drifted.
- Re-cited `Status.IsValidWithCustom` (`types.go:347-359`) so the
  citation matches the function it points at.
- Re-cited `IssueType.IsValid` `552-558` → `553-563`.
- Inverted `--include-deferred` semantics: `bd ready` already returns
  past-defer beads by default; the flag adds *future*-deferred.
- Noted `bd set-state` creates event beads as part of its atomic
  protocol (`cmd/bd/state.go:170-211`).

### `handbook/reference/dependency-types.md`

- Fixed count: 20 → 19 well-known `DependencyType` values
  (`WellKnownDependencyTypes` enum is the authority).
- Re-cited `IsValid` `806-808` → `810-812`, `AffectsReadyWork`
  `825-827` → `838-840`, `WaitsForMeta` `830-837` → `849-857`,
  `AttestsMeta` `864-878` → `884-898`.
- Documented `IsBlockingEdge` (`types.go:845-847`) — narrows "hard
  blocker" to `blocks`, `conditional-blocks`, `waits-for` (excludes
  `parent-child`). Used by `bd dep tree` `[BLOCKED]` badge (GH#3565).
- Dropped non-existent `children-of(step)` `waits-for` gate; current
  code only defines `WaitsForAllChildren` and `WaitsForAnyChildren`
  (`types.go:859-863`).
- Rewrote `bd dep` subcommand table: added `bd dep <a> --blocks <b>`
  sugar and `bd dep list`; renamed `rm` → canonical `remove`
  (alias); expanded `tree` to describe dep-type display + root-only
  `[READY]`/`[BLOCKED]` badge.

### `handbook/reference/hook-protocol.md`

- `post-merge` row: replaced "Always returns 0" with actual behavior —
  runs chained user hook then auto-imports `.beads/issues.jsonl` into
  Dolt when `import.auto` is set (GH#3729).
- `post-checkout` row: same correction — runs chained hook +
  conditional JSONL import on branch checkout (flag=1).
- Renamed `bd migrate-hooks` → `bd migrate hooks --apply` (it's a
  subcommand of `bd migrate`, not hyphenated).

### `handbook/reference/prime-contract.md`

- File size: 515 → 639 lines.
- Flag table source: `prime.go:130-133` → `163-169`.
- Added missing flags: `--memories-only`, `--hook-json` (incl. JSON
  envelope explanation).
- Override-chain refs updated to `prime.go:116-144`; entry-point
  function renamed `outputPrimeContext` → `outputPrimeContextWithOptions`.
- MCP detection: `isMCPActive` at `prime.go:194-232`.
- Default-content sections rewritten against `outputCLIContext`
  (`451-639`) and `outputMCPContext` (`405-448`); removed the
  inaccurate "Ready work / Active work" claim (prime does NOT embed
  live `bd ready` output) and the bogus MCP "Key counts" claim.
- New "Linear auto-pull" section documenting
  `maybePullStaleLinearData` (`prime.go:357-402`) — fires on every
  invocation when `LINEAR_API_KEY` or `linear.api_key` is set and
  data is stale.
- Failure-modes citation `121-125` → `84-97` and `150-158`; added
  `--hook-json` empty-envelope behavior.

### `handbook/reference/metadata-conventions.md`

Surprising finding: the gap is much smaller than the "~25 new keys"
estimate. Empirical diff across non-test gascity code at `2c27373a`:
**one new bead-metadata key** (`gc.last_finalize_error`). Most "new
keys" from a raw grep are OTel instrument names, not bead metadata.

- Added `gc.last_finalize_error` to the Retry/control-loop subsection
  (writer `internal/dispatch/runtime.go:982`; reader = `bd show`
  surface only).
- Expanded the "Non-bead-metadata disambiguation" subsection with a
  full 27-row OTel instrument table (was a 3-example bullet) — these
  live in OTel exporters, not `bead.Metadata`. UIs should not render
  them as metadata.
- Added new disambiguation bullets for cobra `Cmd.Annotations`
  (`gc.docgen.skip`), version-token (`gc.dolt.cleanup.v1`), and the
  latent label typo `gc.session` (dot) vs canonical `gc:session`
  (colon) at `internal/agentutil/pool.go:52`.

### `gaps-audit.md`

Appended "Update 2026-05-20" notes to 10 entries:

- **§A6** (`bd ready` exclusion list duplicated) — drift confirmed.
  Gascity now centralises the list in `internal/beads/beads.go:85-99`
  as `readyExcludeTypes` map; beads still inline. Gascity has added
  `step` + `session` to the upstream seven — drift has begun.
- **§A11** (mutation hooks skip `DeleteIssue`) — gap still applies;
  confirmed via new in-code comment at `hook_decorator.go:319-323`
  that the omission is now deliberate.
- **§C1** (`AffectsReadyWork` vs view) — gap still applies; no newer
  migration past 0025 has touched `ready_issues`.
- **§C5** (two `GenerateHashID`) — gap still applies; hex variant
  still no non-test callers.
- **§C6** (built-in molecules empty) — gap still applies;
  `getBuiltinMolecules()` still returns `nil`.
- **§C7** (interactions table no writer) — gap still applies.
- **§C10** (HOP column drop partial) — **partially resolved**;
  migration 0038 drops `quality_score` and `crystallizes` only.
- **§V1** (orphaned schema columns) — partial cleanup reflected;
  cross-linked to §C10. Six HOP columns remain.
- **§V6** (`bd gate check` bead) — gap still applies;
  `checkBeadGate` still returns false.
- **§V7** (`bd merge-slot`) — gap reframed: command is **still live
  in bd** (`cmd/bd/merge_slot.go`), so the source heading's "removed
  v0.62+" claim is inaccurate. Treat as vestigial-by-disuse.
- **§V8** (federation unused) — gap still applies.
- **§V10** (`message` re-promoted) — substantive update: migration
  0035 now moves `message`/`agent`/`rig`/`role` from `issues` into
  `wisps`, changing storage semantics for mail beads.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6

## Gaps deferred to a future run

- **`handbook/reference/gastown-conventions.md`** — gastown has been
  pruned from the foundations workspace; this whole reference page
  may need either deprecation or a "snapshot" framing. Strategic
  decision deferred.
- **`handbook/reference/convergence-metadata.md`** — gascity
  `convergence.*` keys. Independent namespace, not audited in this
  sweep.
- **`handbook/reference/json-outputs.md` per-command examples** —
  still in legacy shape; will need `.data` wrappers when
  `BD_JSON_ENVELOPE=1` becomes default in v2.0.
- **Explanation pages** — `the-pour-pipeline.md`,
  `the-store-architecture.md`, `agent-coordination.md`,
  `canonical-vs-vestigial.md`, `beads-and-orchestrators.md`,
  `why-beads.md` — not yet swept.
- **`bd init --remote` bootstrap path** — still not documented in
  `bd-commands.md`.
- **`bd dolt push/pull --remote`** flag — still not documented.
- **Status-lifecycle deferred items**: custom-status legacy flat
  config format; `bd list --deferred` filter change (GH#3571);
  default-status-categories function citation.
- **Dependency-types deferred items**: minor citation drift on
  `dependencies.go:122-150` and `:106-115` (off by ~3-9 lines but
  substance still correct); `bd duplicate`/`bd supersede` commands
  not re-verified.

## See also

- `handbook/reference/status-lifecycle.md`
- `handbook/reference/dependency-types.md`
- `handbook/reference/hook-protocol.md`
- `handbook/reference/prime-contract.md`
- `handbook/reference/metadata-conventions.md`
- `gaps-audit.md` (10 entries updated)

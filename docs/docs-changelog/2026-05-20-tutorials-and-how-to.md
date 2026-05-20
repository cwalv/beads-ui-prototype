# 2026-05-20 — tutorials + how-to sweep (parallel audit)

## Scope

Iteration 8. Five-way parallel audit covering all 5 tutorial pages
and all 7 how-to pages. Twelve files touched.

## Changes applied

### Tutorials

**`tutorials/01-your-first-bead.md`** — type list expanded to
include `gate`/`molecule`/`message` as built-ins; added `bd init
--remote` mention; fixed `--labels` → `--label` (correct flag);
added `--exclude-label` example.

**`tutorials/02-working-with-dependencies.md`** — fixed `bd dep
tree` default direction (downward, not upward); rewrote gate-creation
step to use canonical `bd gate create --type gh:pr --blocks <id>
--await-id ...` (replaced invalid `bd create --type gate
--await-type ...`); removed obsolete `types.custom "gate"` step;
removed positional bead-ID arg from `bd ready --explain`; fixed dep
count `20 → 19`; updated cycle error string to match code.

**`tutorials/03-pouring-a-formula.md`** — added intro that
`molecule`/`gate` are built-in (no `types.custom` registration
needed); cited the `cookFormula` auto-stamp at
`cmd/bd/cook.go:445-456`; corrected wisps-not-committed rationale to
cite `0019_wisps_dolt_ignore.up.sql`; added new gotcha noting gate
steps prefer `await_id` over `id`.

**`tutorials/04-exchanging-mail.md`** — replaced fabricated
no-delegate error text with real `cmd/bd/mail.go:51-56` output; added
storage-side note that migration 0035 routes message beads to the
wisps table (dolt-ignored, no longer git-loggable); refreshed
gascity beadmail line refs.

**`tutorials/05-memory-and-context.md`** — replaced fictitious
`## Ready work` / `## Your active work` prime sections in sample
output (prime does NOT embed live `bd ready` — common
misconception); added Variants subsection listing `--memories-only`,
`--hook-json`, `--mcp`, `--export`; added Linear auto-pull
subsection; clarified override-mode behavior (override file emits
solely; memories require `--memories-only` or explicit combination);
fixed `bd export --include-memories` semantics (opt-in for safety,
not "opposite of default").

### How-to

**`how-to/add-a-gate.md`** — removed obsolete "register `gate` as
custom type" prereq; clarified `await_type` is canonical name;
updated gaps-audit cross-ref `§C4` → `§V6`.

**`how-to/write-a-formula.md`** — added paragraph documenting
`needs` and `depends_on` as peer aliases (merged at cook time per
`internal/formula/types.go:220`); replaced legacy `id = "release.yml"`
with `await_id = "release.yml"` in gate snippet; expanded gate-types
list; refreshed `Validate` line range to `549-666`.

**`how-to/write-a-lifecycle-hook.md`** — added explicit note that
the three events are `create`/`update`/`close` (no `on_` prefix in
the script arg) and that `bd delete` deliberately skips firing;
clarified 10s timeout (`hooks.go:38`) and 1024-byte output
truncation (`hooks.go:115`); added "Installing / upgrading" section
with canonical `bd migrate hooks --apply` (NOT `bd migrate-hooks`);
documented GH#3729 post-merge/post-checkout JSONL auto-import when
`import.auto` is set.

**`how-to/back-up-and-restore.md`** — substantial rewrite. JSONL
export flags: `--no-memories` is hidden/deprecated; canonical opt-in
form is `--include-memories` / `--include-infra`; added `--scrub`,
`-o/--output`. JSONL import: removed nonexistent `--file` flag;
documented real surface (positional, `-i/--input`, stdin `-`);
documented GH#2994 auto-import-upgrade and `--dry-run`/`--dedup`.
Replaced fabricated `bd backup --path <tarball>` with real subcommand
tree (`bd backup init/sync/restore/remove/status`). Corrected config
keys `backup.enabled` + `backup.interval` (was `backup.auto`). Added
new "Dolt remote push/pull" section for `--remote <name>` (GH#3211).
Federation example uses `file://` (matches test fixtures) instead of
nonexistent `dolthub://` scheme. Reframed recovery scenarios to use
user-managed JSONL exports rather than a fictional
`.beads/backup/latest.jsonl`.

**`how-to/create-a-graph.md`** — renamed `PlanNode` → `GraphApplyNode`
and `PlanEdge` → `GraphApplyEdge` (match Go struct names); removed
`≤ 500 chars` claim (validator only checks non-empty); clarified
`priority` is a pointer (null defaults to 2); corrected `metadata`
to `map[string]string`; removed nonexistent `metadata` field on
edges; removed fabricated `external:` prefix escape hatch; removed
fabricated `--dry-run` (rejected by dispatch in `create.go`).
Apply order rewritten to match `executeGraphApply` in current code.

**`how-to/create-from-markdown.md`** — removed nonexistent `notes`
section from the parser docs; documented
`validation.ParsePriority`/`ParseIssueType` actual behavior including
invalid-type warning to stderr; removed fabricated
slugified-title cross-reference claim; removed nonexistent
`--message` flag; explicitly documented that `--dry-run` is rejected
with `--file` (error: "--dry-run is not supported with --file
flag"); fixed commit message format.

**`how-to/push-to-github.md`** — substantial rewrite. Removed
fabricated `bd github push <id>` and `bd github pull <ref>`
subcommands; real surface is `sync`, `status`, `repos` only with
direction-flags `--pull-only`/`--push-only`. Fixed `external_ref`
format to `github:<n>` (per `BuildExternalRef`) — NOT `gh-<n>`.
Added selective-sync section (`--issues`/`--parent`, mutually
exclusive). Clarified that GitHub uses `--pull-only`/`--push-only`
while jira/linear/notion use `--pull`/`--push`. Auto-update hook
example updated.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6

## Gaps deferred to a future run

- **`json-outputs.md` per-command examples** — still in legacy
  shape; only matters once `BD_JSON_ENVELOPE=1` becomes default in
  v2.0.
- **Gastown review of prior iterations' edits** — `gastown-conventions.md`
  snapshot framing, plus the `gt sling`/`hook_bead` framing in
  `agent-coordination.md` and `canonical-vs-vestigial.md` from the
  explanation-sweep, were written under a now-corrected false
  premise that gastown was pruned from the workspace. gastown is
  actually present at `/home/cwa/weaveroot/foundations/github/gastownhall/gastown`
  (tip `b1dc37c75dbd0404e81e024385d77115b908eafe`) and has just been
  re-added to this workweave's manifest. A re-audit against actual
  gastown source is queued for a future iteration.
- **`bd backup init` DoltHub auth flow** — only the help-text
  description was used; deeper verification of the auth chain not
  done.
- **Per-tracker quirks** (Linear `--parent`, ADO `--area-path`,
  etc.) — removed from the github page rather than expanded into
  their own pages; those belong in dedicated how-tos if needed.

## See also

- `tutorials/01-your-first-bead.md` through `05-memory-and-context.md`
- `how-to/add-a-gate.md`, `back-up-and-restore.md`,
  `create-a-graph.md`, `create-from-markdown.md`,
  `push-to-github.md`, `write-a-formula.md`,
  `write-a-lifecycle-hook.md`

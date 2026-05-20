# 2026-05-20 — types and --claim

## Scope

Targeted updates against three pieces of drift surfaced in a live
session, not a full mol-docs-refresh sweep. The auto-triage would
have had to chew through 418 beads commits + 649 gascity commits
(well past the formula's `max_commits=200` cap), so this run
adopted a "fix what was named, note what was deferred" scope.

Three repos in current rwv.lock; gastown has been pruned from the
foundations workspace (only beads + gascity remain).

## Changes applied

### 1. gate / molecule are built-in (`bead-schema.md`)

`handbook/reference/bead-schema.md` line 184 previously said:

> `gate` is not a built-in `IssueType` — orchestrators must register
> it via `bd config set types.custom "gate,…"`.

Current code at `internal/types/types.go:556-562` accepts both `gate`
and `molecule` in `IssueType.IsValid()` alongside the work types.
Source comment labels them "internal types" but they pass the strict
validation gate — no `types.custom` registration needed on fresh
installs. Updated the handbook paragraph to reflect this, and
appended a "resolved upstream" note to `gaps-audit.md §C3`.

### 2. New "Type taxonomy" section (`bead-schema.md`)

Inserted between "Workflow" and "Assignment". Documents the 13
recognized `issue_type` values (12 built-in + system-only `event`)
with which validation surface accepts each, links to the gate /
molecule field sections, calls out the `RequiredSections` map, and
sketches the informal "work units / containers / coordination /
workflow artifacts" grouping that the UI and the handbook were
using implicitly.

### 3. `bd update --claim` semantics (`bd-commands.md`)

`bd-commands.md:41` mentioned `--claim` in a table cell ("atomic
claim") but nowhere in the file explained what that atomicity
buys. Added a subsection under "Issue lifecycle" describing the
status / assignee / started_at triple, the multi-agent race that
makes the atomicity load-bearing, and the pairing with `bd close
--claim-next`.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6

(gastown not tracked in current rwv.lock.)

## Gaps deferred to a future run

- **Full commit triage** — 1067 commits across beads + gascity since
  the 2026-04-23 bootstrap entry. A normal mol-docs-refresh pour
  needs the operator to either lower `max_commits` and run in
  chunks, or do an intermediate `rwv lock` to a sub-range.
- **Other handbook drift** likely exists in the schema, CLI surface,
  and metadata sections — this run did not survey beyond the three
  named items.
- **`mol-docs-refresh.formula.toml`** itself bails on >200 commits.
  Worth thinking about a "stream-as-you-go" mode where the formula
  triages in batches rather than failing fast.

## See also

- `handbook/reference/bead-schema.md` § Type taxonomy
- `handbook/reference/bd-commands.md` § `bd update --claim` (atomic claim)
- `gaps-audit.md` § C3

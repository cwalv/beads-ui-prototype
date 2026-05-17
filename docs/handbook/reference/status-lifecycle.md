# Status lifecycle

## Built-in statuses

From `internal/types/types.go:326-334`:

| Status | Category | Meaning |
|---|---|---|
| `open` | active | Fresh, unclaimed, ready for work. |
| `in_progress` | wip | Claimed; actively being worked. |
| `blocked` | wip | Flagged as blocked (by the writer). See **Note below**. |
| `hooked` | wip | "Actively claimed by a worker" — orchestrator convention. |
| `deferred` | frozen | Hidden from `bd ready`; optionally auto-unhides after `defer_until`. |
| `pinned` | frozen | Persistent context; views skip like closed. |
| `closed` | done | Completed; `closed_at` set. |

**Note on `blocked`**: setting `status='blocked'` is a manual override
by the author; it's not computed from dependencies. The actual "this
issue has open blockers" state is computed at read time by the
`blocked_issues` view. An issue with `status='open'` can still appear
as blocked in `bd list` if it has open `blocks` deps.

## Category semantics

Categories drive inclusion in `bd ready` and the default `bd list`.

| Category | In `bd ready`? | In default `bd list`? |
|---|---|---|
| `active` | yes | yes |
| `wip` | no | yes |
| `done` | no | no |
| `frozen` | no | no |

## `hooked` — orchestrator convention

`hooked` is defined in beads but beads itself never transitions to or
from it. `validation.NotHooked`
(`internal/validation/issue.go:78-88`) blocks edits on a hooked bead
unless `--force` is passed — protection for in-flight work.

Gastown writes `bd update --status=hooked` when it assigns work via
sling (`gastown/internal/cmd/bd_helpers.go`). Gascity does not use
`hooked`; it relies on `gc.routed_to` metadata plus assignee to signal
claim.

Treat `hooked` as "the orchestrator claims this; back off unless you're
that orchestrator."

## Custom statuses

`bd config set status.custom "name1:active,name2:wip,name3:done"` —
comma-separated `<name>:<category>` entries.

Rules (`internal/types/types.go:420-476`):

- Name matches `^[a-z][a-z0-9_-]*$`.
- Max 50 distinct custom statuses.
- Can't collide with built-in names.
- Category must be one of `active`, `wip`, `done`, `frozen`.

Persisted in both the `config` table (key `status.custom`) and the
`custom_statuses` table. The views read from the table
(`migrations/0025_update_ready_issues_view.up.sql:28`).

Common orchestrator-added customs: `review`, `testing`, `waiting`.
Whether these end up active or wip depends on the orchestrator.

## Transitions

`UpdateIssue` accepts any status string that's a built-in or a
configured custom (`types.go:347-359`). There's no state machine.

Enforced transitions (beads-core):

- **Claim** (`internal/storage/dolt/issues.go:196-230`):
  `ClaimIssue(id, actor)` sets `assignee=actor` AND
  `status='in_progress'` only if the issue has no assignee yet
  (compare-and-swap). Returns `ErrAlreadyClaimed` on collision.
- **Close** (`issues.go:260-`): sets `status='closed'` and back-fills
  `closed_at` if missing.
- **Reopen** (`issues.go:235-249`): sets `status='open'` and clears
  `defer_until`. Optional `--reason` becomes a comment.

Everything else is free-form `bd update --status <X>`.

## Defer

`bd defer <id> --until <time>` sets `status='deferred'` and optionally
`defer_until` (`cmd/bd/defer.go:15-109`):

- `--until` parses relative (`+1h`, `+2w`), natural
  (`tomorrow`, `next monday`), or absolute (`YYYY-MM-DD`) times.
- Past-dated values trigger a warning; bead reappears in `bd ready`
  immediately.
- `bd undefer <id>` sets `status='open'` and clears `defer_until`.

`bd ready` excludes deferred beads by default;
`--include-deferred` shows any whose `defer_until` has passed.

## Pinned

Two different meanings — see
[../../gaps-audit.md](../../gaps-audit.md) §B5.

1. **Status `pinned`** — the lifecycle value. Views treat it like
   closed. Useful for "this bead is persistent context that shouldn't
   be surfaced as work."
2. **Column `pinned` (bool)** — a separate marker, described as
   "persistent context marker, not a work item"
   (`types.go:86`). No built-in view consults this.

Favor status `pinned` for the lifecycle meaning. The column is present
for legacy reasons.

## Events

`issue_type='event'` beads are system-internal audit records.
Distinguishing characteristics:

- **Accepted** by `IsValidWithCustom` and `IsBuiltIn` (federation
  trusts them).
- **NOT accepted** by the strict `IsValid`
  (`internal/types/types.go:552-558`) — the strict validator excludes
  events from user-facing creation paths.
- `event_kind`, `actor`, `target`, `payload` columns populated.

They enter via the normal issue-create path with
`issue_type=event` set — typically by orchestrator operations, not by
users directly. Beads-core has no `bd event create` CLI.

See [explanation/agent-coordination.md](../explanation/agent-coordination.md)
for how orchestrators do (and don't) use this.

## See also

- [bead-schema.md](bead-schema.md#workflow) — the `status` column.
- [dependency-types.md](dependency-types.md) — what makes a bead
  "blocked" in the view sense.
- [../explanation/canonical-vs-vestigial.md](../explanation/canonical-vs-vestigial.md)
  — pragmatic guidance on which statuses to surface.

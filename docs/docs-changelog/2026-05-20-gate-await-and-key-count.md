# 2026-05-20 — gate await_id + gc.* count

## Scope

Iteration 3 of the catch-up. Two targeted fixes derived from spot-checking
the formula schema and metadata-conventions reference pages against
current beads + gascity tips.

## Changes applied

### 1. Formula gate `await_id` field (`formula-schema.md`)

`internal/formula/types.go:288` adds `AwaitID string` to the
formula `Gate` struct (GH#3382). It's the preferred new name —
maps directly to `Issue.AwaitID` at cook time. `id` is kept as a
legacy alias. Updated the Go type sketch and the example TOML to
use `await_id`; added an explanatory paragraph.

### 2. `gc.*` key count (`metadata-conventions.md`)

The handbook intro claimed "roughly 60 `gc.*` keys" — measured at the
2026-04-23 bootstrap. A `grep -rohE '"gc\.[a-z_]+"' internal/`
across gascity at `2c27373a` returns **85** distinct quoted
metadata-key literals. Updated the count and added a note that the
deep-dive's per-key audit is snapshotted at bootstrap, so additions
since aren't fully there.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6

## Gaps deferred to a future run

- **Full gascity metadata key audit** — 25 net new keys vs the
  deep-dive's coverage. Categorizing and adding the missing ones to
  metadata-conventions.md is a sizeable task; the count update above
  flags the gap honestly without pretending to close it.
- **`json-outputs.md`** — BD_JSON_ENVELOPE shape, structured-error
  format, schema_version field still not surveyed.
- **`bd init --remote`** bootstrap, `bd dolt push/pull --remote`
  flag — deferred from iteration 2.
- **HOP column drop** (`migration 0038`) — partial fix; gaps-audit
  §V1 still applies for other HOP cols.

## See also

- `handbook/reference/formula-schema.md` § Composition rules → gate
- `handbook/reference/metadata-conventions.md` § `gc.*` — gascity

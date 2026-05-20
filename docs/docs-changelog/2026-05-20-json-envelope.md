# 2026-05-20 — JSON envelope + structured errors

## Scope

Iteration 4. Documents the JSON wire contract additions
(`BD_JSON_ENVELOPE=1` opt-in envelope + structured-error category
field). Wire-contract changes are high-value for clients to know
about before v2.0 makes envelope mode the default.

## Changes applied

### 1. Envelope mode section (`json-outputs.md`)

Added a new "Envelope mode (`BD_JSON_ENVELOPE=1`)" section
documenting:

- The envelope shape: `{"schema_version": 1, "data": <payload>}`
- Migration jq one-liners (legacy → envelope)
- Schema version bump policy (breaking vs additive)
- Migration timeline: opt-in now, default in v2.0, escape hatch one
  release later
- Source pointer to `cmd/bd/output.go:21`

### 2. Structured errors section (`json-outputs.md`)

Added a section documenting the typed error object inside the
envelope: `error`, `hint`, `category` fields. Categories
(`validation`, `not_found`, `conflict`, `database`, `network`, …)
are stable identifiers a client can switch on without parsing
error strings.

Source: `beads/docs/JSON_SCHEMA.md` + `cmd/bd/errors.go` +
`cmd/bd/protocol/json_contract_test.go`.

## Tips

- beads @ da73b7511ccac8069a53fcb7a8963e8c9c9433a6
- gascity @ 2c27373a92f9568f40935f5c5067bd33b8584ba6

## Gaps deferred to a future run

- **Per-command envelope examples** — the existing `bd show --json`,
  `bd list --json`, etc. sections still show the legacy shape only.
  When envelope becomes default in v2.0 those examples will all
  need an explicit `.data` wrapper. Not done yet; envelope is opt-in
  so the legacy shape remains valid.
- **gascity metadata key audit** (25 net new keys vs deep-dive's
  coverage) — still deferred.
- **`bd init --remote` / `bd dolt push|pull --remote`** — deferred.
- **HOP column drop status** (`migration 0038` partial) — deferred.

## See also

- `handbook/reference/json-outputs.md` § Envelope mode, Structured errors
- Upstream: `github/gastownhall/beads/docs/JSON_SCHEMA.md`

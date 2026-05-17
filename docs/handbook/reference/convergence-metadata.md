# `convergence.*` namespace

gascity owns a **second** metadata namespace beyond `gc.*`:
`convergence.*`. It's used by the convergence-loop primitive — beads
created by the `converge:` block in formulas or by order-driven
convergence workflows.

Catalog derived from `internal/convergence/metadata.go:12-40` (named
constants) and verified against
[../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md)
§9.

Companion doc: [metadata-conventions.md](metadata-conventions.md)
(covers `gc.*` and label conventions).

## State machine

| Key | Purpose |
|---|---|
| `convergence.state` | `creating` / `active` / `waiting_manual` / `terminated` |
| `convergence.iteration` | Current loop iteration (int) |
| `convergence.max_iterations` | Upper bound |

## Formula / target

| Key | Purpose |
|---|---|
| `convergence.formula` | Formula id this loop runs |
| `convergence.target` | Target agent / pool |
| `convergence.city_path` | Absolute city path (propagated to sub-processes) |
| `convergence.evaluate_prompt` | Prompt for the evaluator agent |

## Gate config

Declares how the loop evaluates whether to continue, retry, or
terminate.

| Key | Purpose |
|---|---|
| `convergence.gate_mode` | `manual` / `condition` / `hybrid` |
| `convergence.gate_condition` | Gate condition expression (evaluated by condition / hybrid modes) |
| `convergence.gate_timeout` | Duration string (e.g. `"15m"`) |
| `convergence.gate_timeout_action` | What to do on timeout: `iterate` / `retry` / `manual` / `terminate` |

## Gate runtime

Written by the gate evaluator after each evaluation pass.

| Key | Purpose |
|---|---|
| `convergence.gate_outcome` | `pass` / `fail` / `timeout` / `error` |
| `convergence.gate_exit_code` | Exit code of the gate script (if exec-based) |
| `convergence.gate_outcome_wisp` | Bead id of the wisp that produced the gate outcome |
| `convergence.gate_retry_count` | Retry counter for gate evaluation |
| `convergence.gate_stdout` | Captured gate stdout |
| `convergence.gate_stderr` | Captured gate stderr |
| `convergence.gate_duration_ms` | Wall-clock duration (milliseconds) |
| `convergence.gate_truncated` | `"true"` / `"false"` — stdout/stderr capture truncated |

## Wisp tracking

The loop pours a new wisp per iteration; these keys track which wisp
is active / just processed / next in the queue.

| Key | Purpose |
|---|---|
| `convergence.active_wisp` | Wisp currently being processed |
| `convergence.last_processed_wisp` | Cursor — most recently processed wisp |
| `convergence.pending_next_wisp` | Next wisp queued for processing |

## Agent verdict

| Key | Purpose |
|---|---|
| `convergence.agent_verdict` | `approve` / `approve-with-risks` / `block` (normalized) |
| `convergence.agent_verdict_wisp` | Wisp that produced the verdict |

## Termination

| Key | Purpose |
|---|---|
| `convergence.terminal_reason` | `approved` / `no_convergence` / `stopped` / `partial_creation` |
| `convergence.terminal_actor` | Who terminated (agent name) |
| `convergence.waiting_reason` | `manual` / `hybrid_no_condition` / `timeout` / `sling_failure` |
| `convergence.retry_source` | Source of retry trigger |

## Variables (`var.*` prefix)

Template variables the convergence formula substitutes into gate
prompts. Example from `internal/convergence/retry_test.go:35`:

```go
VarPrefix + "doc_path": "/docs/readme.md"
```

Keys are of the form `var.<name>`. User-supplied.

## Storage

Writers are in `internal/convergence/` and the convergence-tick path
at `cmd/gc/convergence_tick.go` and `cmd/gc/cmd_converge.go`. Readers
span `cmd/gc/cmd_converge.go`, `cmd/gc/convergence_store.go`, and
the reconciler.

## See also

- [metadata-conventions.md](metadata-conventions.md) — `gc.*` and
  label conventions.
- [../../gascity-metadata-deep-dive.md](../../gascity-metadata-deep-dive.md)
  — full per-key writer/reader audit.
- [../../05-gascity-integration.md](../../05-gascity-integration.md)
  §10.1 — convergence loop narrative.

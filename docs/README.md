# beads-ui deep-dive docs

Comprehensive reference for the beads data model, CLI, concepts, and how
gastown / gascity consume them. Supports the beads-ui work (the SPA at
`github.com/cwalv/beads-ui-prototype` + bd-server backend).

## Why

The UI surfaces beads functionality to help operators understand the
concepts and learn as they go. That only works if the concepts the UI
portrays match what beads actually does — and the existing design
doesn't yet rest on a grounded model. Docs across beads / gastown /
gascity may not match code or actual usage.

**Code is authoritative.** These docs read the code and cite it.

## Two layers

### Raw material (numbered docs)

The deep-dive research produced by five parallel research agents, each
scoped to one topic. Long, dense, citation-heavy. Use these when you
need the full context behind a handbook claim.

| Doc | Scope | Lines |
|---|---|---|
| [01-data-model.md](01-data-model.md) | What a bead is: schema, IDs, lifecycle, deps, storage | 1,503 |
| [02-cli-surface.md](02-cli-surface.md) | `bd` subcommands, JSON output, hooks, `bd prime` | 1,938 |
| [03-concepts.md](03-concepts.md) | Formulas, molecules, mail, memories, events, hooks, trackers, gates, convoys — beads-core vs orchestrator-only | 1,234 |
| [04-gastown-integration.md](04-gastown-integration.md) | How gastown uses `bd` — agents, crews, dogs, mayor, roles | 1,727 |
| [05-gascity-integration.md](05-gascity-integration.md) | How gascity uses `bd` — store abstraction, dispatch, formulas, molecules, convoys, orders | 1,806 |

### Synthesis (the handbook + audit)

Organized, opinionated, Diátaxis-structured. The daily driver.

| Doc | Purpose |
|---|---|
| [gaps-audit.md](gaps-audit.md) | Cross-doc inconsistencies, naming collisions, vestigial code, orchestrator divergences |
| [gascity-metadata-deep-dive.md](gascity-metadata-deep-dive.md) | Per-key writer/reader audit of gascity's `gc.*` and `convergence.*` metadata namespaces (~60 + 28 keys) |
| [gastown-conventions-deep-dive.md](gastown-conventions-deep-dive.md) | Per-convention writer/reader audit of gastown's three substrates — ~65 description fields + ~60 labels + 1 metadata key |
| [ui-review.md](ui-review.md) | Review of the beads-ui-prototype against this handbook — every UI element mapped to a reference entry |
| [architecture-decisions.md](architecture-decisions.md) | Three load-bearing architectural calls (proto-defined wire contract, drivers vs domain, convention layer) that resolve several `ui-review.md` cross-cutting findings before the catalog walk |
| [handbook/](handbook/README.md) | Diátaxis handbook — tutorials, how-to, reference, explanation |

## Start here

- **Building a UI?** → [handbook/README.md](handbook/README.md) +
  [handbook/reference/bead-schema.md](handbook/reference/bead-schema.md)
  + [handbook/reference/json-outputs.md](handbook/reference/json-outputs.md).
- **Understanding what beads IS?** → [handbook/explanation/why-beads.md](handbook/explanation/why-beads.md).
- **Deciding canonical vs vestigial?** → [gaps-audit.md](gaps-audit.md) +
  [handbook/explanation/canonical-vs-vestigial.md](handbook/explanation/canonical-vs-vestigial.md).
- **Just learning the tool?** → [handbook/tutorials/](handbook/tutorials/README.md).

## Conventions

- **Code is authoritative.** Every non-trivial claim cites `path:line`,
  workspace-relative (e.g., `github/gastownhall/beads/internal/types/types.go:123`).
- **Gaps are flagged, not resolved silently.** Every doc has a "Gaps &
  contradictions" section; the audit consolidates them.
- **Emphasis is beads.** Gastown and gascity appear as evidence for
  vestigial-vs-canonical calls, not as first-class subjects.

## Provenance

The numbered docs were produced on 2026-04-23 by five parallel research
beads (`fo-7lc1i`, `fo-khy7z`, `fo-b5dxx`, `fo-sfp4z`, `fo-sr33p`), each
scoped to one topic and written by a `foundations/worker` session with
the instruction to cite `path:line` for every non-trivial claim.

The synthesis (`gaps-audit.md` + `handbook/`) was written from the
numbered docs, not directly from code — when a handbook claim feels
tentative, follow its link back to the numbered doc for the citation.

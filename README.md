# beads-ui-prototype

Workspace for prototyping a UI for [beads](https://github.com/gastownhall/beads) — issues, dependencies, molecules, and formulas — using Claude Design.

## Why this repo

Claude Design is the iteration surface; this repo gives it the docs and concrete artifacts it needs to design against. Nothing here is canonical — everything is copied from `gastownhall/beads` and one foundations city for context.

## Contents

### `docs/` — concept reference

Curated subset of beads docs covering the data model, vocabulary, and surfaces the UI needs to render.

| File | Source | Purpose |
|------|--------|---------|
| `ARCHITECTURE.md` | beads/docs/ARCHITECTURE.md | Two-layer data model, schema, dependency types |
| `MOLECULES.md` | beads/docs/MOLECULES.md | Molecule / wisp / proto / digest vocabulary |
| `CLI_REFERENCE.md` | beads/docs/CLI_REFERENCE.md | Full command surface |
| `METADATA.md` | beads/docs/METADATA.md | Issue metadata taxonomy |
| `LABELS.md` | beads/docs/LABELS.md | Label taxonomy |
| `CONFIG.md` | beads/docs/CONFIG.md | Workspace config |
| `formulas.md` | beads/website/docs/workflows/formulas.md | Formula concept doc |
| `beads-README.md` | beads/README.md | Beads onboarding |
| `beads-CLAUDE.md` | beads/CLAUDE.md | Quick agent reference |

### `formula-examples/` — concrete TOML to render

Three real-world formulas, picked to span the complexity range.

| File | Steps | Notes |
|------|-------|-------|
| `mol-do-work.formula.toml` | 2 | Minimal — single work step + drain |
| `mol-weave-work.formula.toml` | foundations example | Composition; rig-scoped work pattern |
| `gastownhall-upstream.formula.toml` | 8 | Real-world — non-trivial `needs` DAG, retry/metadata, idempotency hinges, mailroom escalations |

## UI scope (working priorities)

- **P0 — Formula authoring + visualization**. Two-pane synchronized editor (graph view ↔ raw `.toml`) in the spirit of Mapbox Studio's style editor or browser devtools' DOM/CSS panes. Step DAG with `needs` arrows, var palette, retry/metadata badges per step, composition tree (`extends` / `compose`), `bd cook` preview.
- **P1+ — Work-graph / issue-detail / work-queue views**. The broader beads surface: render arbitrary dependency DAGs, issue editing, ready/blocked queues. Important but downstream of formula authoring.

## Source of truth

Anything in this repo is a snapshot. Authoritative sources:

- Beads CLI + docs: <https://github.com/gastownhall/beads>
- Formula examples are pulled from `gastownhall/gascity` city configs and `gastownhall/foundations` rig configs.

## Status

Early. No prototype code yet — this repo's job for now is to be a context bundle that Claude Design can read.

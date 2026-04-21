# Beads UI prototype — handoff

Two HTML artifacts, both self-contained (just open in a browser):

| File | Purpose |
|------|---------|
| `Beads UI Wireframe.html` | **Wireframe canvas** — every surface at low/mid fidelity, laid out on a pan/zoom board. The source of truth for the _architecture_. |
| `Beads · Formula Editor.html` | **Hi-fi interactive prototype** of the Author · Edit destination. Live TOML↔DAG sync, four wired vars, cook preview, instances tab. |

Both pull from plain JSX files alongside them (`wf-*.jsx`, `editor-*.jsx`) and two CSS files. No build step.

## What this prototype is claiming

The UI-DESIGN.md priority gradient (P0 formula editor, P1+ everything else) is a _shipping order_, not an architecture. The architecture is three destinations on two axes — **tempo** (slow/fast) and **backend** (filesystem/Dolt) — plus a shared peek drawer and a workspace switcher:

| Destination | "What's it for?" | Tempo | Backend |
|-------------|------------------|-------|---------|
| **Author**  | What _should_ happen? (formulas) | slow, edit-heavy | filesystem `.beads/formulas/` |
| **Observe** | What _is_ happening? (molecules, beads) | real-time, read-heavy | Dolt |
| **Capture** | Here's a new bead. | fast, single write | Dolt |

Issue detail, catalog, cook, timeline — all modes/layouts/peeks, not separate destinations.

## Recent changes (this commit)

Two pieces of pushback from the last review drove the current state of Capture and Observe:

### Capture is no longer a DSL

**Before:** a batch-paste surface where `[epic] (P1) foo \n  > blocks bar` parsed into multiple beads with dep edges. Clever but wrong — it reinvented formulas in a second syntax.

**After:** a single-bead form (title · description · type · priority · assignee · labels · external_ref · deps with a dep-type picker). The "turn this into an epic with phases" path belongs on the _bead_ as a second-click action (**Expand to epic** — not yet drawn but called out in the footer copy). That action pours a formula; it doesn't happen at capture time.

Artboard: `C · Capture · Single-bead form` in the wireframe canvas.

### Observe now has a third layout: Fleet

**Gap identified in review:** Observe answered "one molecule's timeline" (Timeline) and "one molecule's dep structure" (Graph) well, but had no answer for "what's running right now across the city?"

**Fix:** a third layout toggle alongside Graph / Queue / **Fleet**. One row per live molecule, grouped by formula by default (toggle to workspace/status). Workspace-colored left bar, current phase name, progress bar, status column (`running` / `retry N/M` / `at gate` / `blocked`). Click a row → drops into that molecule's Timeline.

This makes Observe's three layouts a zoom-out sequence:
- **Fleet** — across many molecules ("what's running")
- **Graph** — one molecule's dep shape ("what is this")
- **Timeline** — one molecule's execution history ("what happened")

Artboard: `O · Observe · Fleet` in the wireframe canvas.

### Other surfaces in the wireframe

Previously landed (not changed this round, included for completeness):

- `A · Architecture` — the overview diagram explaining the three-destinations model.
- `A · Author · Browse` — formula catalog (card grid, search, filter by type).
- `A · Author · Edit · Source / Cook / Instances` — three tabs of the two-pane editor. Source is the TOML↔DAG pair; Cook renders vars into a proto preview; Instances lists poured molecules.
- `O · Observe · Graph / Queue / Timeline` — the other two Observe layouts + the one Fleet just joined.
- `O · Peek drawer` — the shared bead/molecule detail overlay.
- `W · Workspace switcher` — consolidated-view pattern (color-bar-per-workspace in result rows).
- `L · Learn` — onboarding page (low priority).

## What to look at in the hi-fi editor

`Beads · Formula Editor.html` renders `gastownhall-upstream.formula.toml` and wires:

- **Click a DAG node** → cursor jumps to that step's `[[steps]]` block in the TOML pane, line highlighted.
- **Edit the TOML** (e.g. change a step's `needs`, add a new step, delete one) → the DAG redraws live with debounced parse.
- **Four vars are form-wired** for real (type checked against the TOML schema): `kind` (enum), `regression_required` (bool), `upstream_owner`, `upstream_repo` — editing in the form rewrites the `[vars.X.default]` in the TOML source.
- **Cook tab** resolves `{{var}}` interpolations into the rendered proto preview.
- **Instances tab** shows 3 stub molecules poured from this formula (placeholder data — this is the handoff point to a real `bd` backend).

The editor is the artifact most worth scrutinizing. Questions I punted on:

1. **TOML range tracking.** The current parser rebuilds ranges on every edit; a real implementation wants incremental parse + source maps. Is that worth the complexity on a file that's rarely >2k lines?
2. **Var form schema.** Today each var has ad-hoc form widgets. A `[vars.X.ui]` section in the formula spec (hint `type="path"` vs `"enum"` vs `"bool"`) would let authors drive the form. Worth adding to the formula schema?
3. **Cook preview vs dry-run.** Cook here renders the _static_ proto tree. `bd pour --dry-run` produces the real thing. Should the UI shell out to `bd` for this, or reimplement the cook pipeline in-browser?

## Questions I need answered to keep going

Flagged in order of how blocking they are:

1. **Data API shape.** UI-DESIGN.md says this is tracked under `fo-beads-ui-api-spec`. Is there anything concrete yet? The Fleet view especially needs a "list active molecules" endpoint with a tick protocol, and I've been faking both.
2. **Formula filesystem vs bead store.** Does the UI hit the FS directly (via a local server wrapper), or does `bd` expose formulas via its JSON surface? The Catalog/Browse mode's resolution of `extends` and `compose` depends on this.
3. **Wisp visibility.** UI-DESIGN.md says wisps must be visually distinct. I've been treating them as a badge on the molecule card. Is that enough, or should Fleet have a wisps-only toggle since they're invisible to collaborators?
4. **Gate interactions.** The release-formula example has `type="human"` gates. Is approving/releasing a gate done _in_ the UI, or does the UI just surface that a gate is blocking and link out to whatever resolves it (Slack, mail, CLI)?
5. **Continuation groups.** The upstream-submit formula uses `gc.continuation_group` metadata on every step. Today I'm ignoring this in the DAG viz. Should it render as a swimlane / colored band?

## File map

This prototype lives under `prototype-v1/` in the repo. Paths below are relative to that directory; shared repo files are at `../`.

```
prototype-v1/
├── Beads UI Wireframe.html          # canvas of all wireframes
├── Beads · Formula Editor.html      # hi-fi interactive prototype
│
├── wf-shared.jsx                    # shared primitives: TopChromeV2, FootBar, chips, etc
├── wf-v2.jsx                        # destinations: Arch, Capture, ObserveFleet, WorkspaceSwitcher
├── wf-views.jsx                     # Observe Graph / Queue / Timeline + peek drawer
├── wf-formula-editor.jsx            # Author · Edit · Source surface (wireframe version)
├── wf-dag-cook.jsx                  # Author · Edit · DAG + Cook + Instances
├── wf-learn.jsx                     # Learn destination
├── wireframe-v2.css                 # v2 tokens + primitive styles
├── wireframe-styles.css             # v1 tokens (still referenced by some wf-* files)
│
├── editor-app.jsx                   # hi-fi editor shell
├── editor-dag.jsx                   # hi-fi DAG renderer (dagre-like layout, live redraw)
├── editor-toml.jsx                  # hi-fi TOML pane (syntax highlight, range-based line highlight)
├── editor-styles.css                # hi-fi editor tokens
│
├── design-canvas.jsx                # starter component: pan/zoom canvas with DCSection/DCArtboard
├── gastownhall-upstream.formula.toml → ../formula-examples/gastownhall-upstream.formula.toml (symlink)
└── HANDOFF.md                       # this file

../README.md                         # repo intro
../UI-DESIGN.md                      # running design notes — updated post-handoff to adopt the three-destinations architecture
../docs/                             # curated beads concept reference
../formula-examples/                 # three real formulas; the symlink above points at one of them
```

## Commit message draft

```
prototype: Capture as single-bead form; add Observe · Fleet layout

Capture previously exposed a batch-paste DSL that reinvented formulas
in a second syntax. Replace with a focused single-bead form (title,
description, type, priority, labels, deps with dep-type picker). The
"expand this into phased work" path belongs on the bead, not in Capture,
and pours a formula — captured in footer copy, surface for it not drawn.

Observe previously had Graph + Queue + Timeline but no cross-molecule
view. Add Fleet as a third layout: one row per live molecule, grouped by
formula, workspace-colored left bars, current phase + progress + status.
Click-through to that molecule's Timeline. Makes Observe a three-level
zoom: Fleet (many molecules) → Graph (one molecule's shape) → Timeline
(one molecule's history).

No changes to Author or the hi-fi formula editor.
```

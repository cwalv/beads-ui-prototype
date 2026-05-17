# Tutorial 3: Pouring a formula

Goal: write a TOML formula, cook it, pour it, follow with
`bd mol current`.

## Prereqs

- Completed [tutorial 2](02-working-with-dependencies.md).

## What you'll build

A 4-step "release" workflow as a formula. Pouring it creates a
molecule (a workflow instance) with 4 child beads connected by
`blocks` deps.

## Step 1: write the formula

```
$ mkdir -p .beads/formulas
$ cat > .beads/formulas/mol-release.formula.toml <<'EOF'
formula    = "mol-release"
description = "Cut a release"
version    = 1
type       = "workflow"

[vars]
version = { description = "Release version", required = true, pattern = "^\\d+\\.\\d+\\.\\d+$" }

[[steps]]
id    = "changelog"
title = "Update CHANGELOG for {{version}}"

[[steps]]
id         = "tag"
title      = "Create git tag v{{version}}"
depends_on = ["changelog"]

[[steps]]
id         = "publish"
title      = "Publish release"
depends_on = ["tag"]

[[steps]]
id         = "announce"
title      = "Announce in #releases"
depends_on = ["publish"]
EOF
```

Verify the file parses:

```
$ bd formula list
NAME          TYPE      DESCRIPTION    SOURCE
mol-release   workflow  Cut a release  .beads/formulas/mol-release.formula.toml
```

And see details:

```
$ bd formula show mol-release
Name:        mol-release
Type:        workflow
Description: Cut a release

Variables (1):
  version — required, pattern ^\d+\.\d+\.\d+$

Steps (4):
  changelog  — Update CHANGELOG for {{version}}
  tag        — Create git tag v{{version}} (depends_on: changelog)
  publish    — Publish release           (depends_on: tag)
  announce   — Announce in #releases      (depends_on: publish)
```

## Step 2: cook the formula

"Cook" compiles the formula into a proto. Two modes:

- Compile mode (default): `{{variable}}` stays as placeholder.
- Runtime mode (any `--var` flag): substitute variables.

Try compile mode first:

```
$ bd formula show mol-release | head -20
# ...
$ bd cook mol-release --mode compile | head -20
{
  "name": "mol-release",
  "steps": [
    {"id": "changelog", "title": "Update CHANGELOG for {{version}}", ...},
    ...
  ]
}
```

Variables stay as `{{version}}`. Useful for planning / contractor
handoff.

Runtime mode:

```
$ bd cook mol-release --var version=1.2.0 --mode runtime | head -5
{
  "name": "mol-release",
  "steps": [
    {"id": "changelog", "title": "Update CHANGELOG for 1.2.0", ...}
```

Now `{{version}}` is `1.2.0`.

## Step 3: pour the formula

Pour creates real beads:

```
$ bd pour mol-release --var version=1.2.0
Created molecule bd-tutorial-mol-abc123 with 4 steps
  changelog → bd-tutorial-mol-abc124
  tag        → bd-tutorial-mol-abc125
  publish    → bd-tutorial-mol-abc126
  announce   → bd-tutorial-mol-abc127
```

Each step became a child bead. Dependency edges (`blocks`) were
created: changelog ← tag ← publish ← announce.

List them:

```
$ bd list --parent bd-tutorial-mol-abc123
○ bd-tutorial-mol-abc124 · Update CHANGELOG for 1.2.0  [P2 · OPEN]
○ bd-tutorial-mol-abc125 · Create git tag v1.2.0        [P2 · OPEN]
○ bd-tutorial-mol-abc126 · Publish release              [P2 · OPEN]
○ bd-tutorial-mol-abc127 · Announce in #releases        [P2 · OPEN]
```

## Step 4: follow with `bd mol current`

The step runner. Tells you which step is ready.

```
$ bd mol current bd-tutorial-mol-abc123
Molecule: bd-tutorial-mol-abc123 · Cut a release (v1.2.0)
Steps:
  [ready]   changelog — Update CHANGELOG for 1.2.0  (bd-tutorial-mol-abc124)
  [blocked] tag        — Create git tag v1.2.0      (bd-tutorial-mol-abc125)
  [blocked] publish    — Publish release            (bd-tutorial-mol-abc126)
  [blocked] announce   — Announce in #releases      (bd-tutorial-mol-abc127)
```

States:

- `done` — closed.
- `current` — in_progress.
- `ready` — open, all `blocks` deps satisfied.
- `blocked` — open, at least one open `blocks` dep.

## Step 5: work the molecule

Close the first step:

```
$ bd close bd-tutorial-mol-abc124 --reason "CHANGELOG updated"
✓ Closed bd-tutorial-mol-abc124
```

Check state:

```
$ bd mol current bd-tutorial-mol-abc123
Molecule: bd-tutorial-mol-abc123 · Cut a release (v1.2.0)
Steps:
  [done]    changelog
  [ready]   tag        — Create git tag v1.2.0
  [blocked] publish
  [blocked] announce
```

tag is now ready. Continue:

```
$ bd close bd-tutorial-mol-abc125 --claim-next
✓ Closed bd-tutorial-mol-abc125
✓ Claimed bd-tutorial-mol-abc126
```

`--claim-next` automatically claims the next ready step, so the
worker continues without re-running `bd mol current`.

## Step 6: see progress

```
$ bd mol progress bd-tutorial-mol-abc123
Molecule:      bd-tutorial-mol-abc123 · Cut a release (v1.2.0)
Total:         4 steps
Completed:     2
In progress:   1
Current step:  publish
Progress:      50%
```

JSON form:

```
$ bd mol progress bd-tutorial-mol-abc123 --json
{
  "molecule_id": "bd-tutorial-mol-abc123",
  "molecule_title": "Cut a release (v1.2.0)",
  "total": 4,
  "completed": 2,
  "in_progress": 1,
  "current_step_id": "bd-tutorial-mol-abc126",
  "percent": 50,
  "rate_per_hour": 2.0,
  "eta_hours": 1.0
}
```

## Step 7: wisp a formula (ephemeral)

`bd mol wisp` creates the same structure but in the wisps table — not
dolt-committed, not shared via git. Use for one-off workflows:

```
$ bd mol wisp mol-release --var version=1.2.1
Created wisp bd-tutorial-wisp-xyz
```

Wisps auto-GC via `wisp_type` TTL. A wisp without a set `wisp_type`
is retained until explicitly burned or squashed.

## Gotchas

- **Formulas and molecules live in different places.** Formula
  *files* at `.beads/formulas/`; molecule *beads* in the `issues`
  table (for pour) or `wisps` table (for wisp).
- **`bd pour` with a formula name cooks inline.** A persistent proto
  bead is NOT created unless you `bd cook --persist`.
- **Only `blocks` deps enforce step readiness** (per the
  [gaps-audit §C1](../../gaps-audit.md)). `depends_on` in the formula
  becomes `blocks` deps at cook time.
- **`{{variable}}` substitution happens at cook time.** The compiled
  proto shows resolved titles.

## Next up

- [Tutorial 4: mail](04-exchanging-mail.md) — use `bd mail` to send
  messages between agents.
- [how-to/write-a-formula.md](../how-to/write-a-formula.md) — more
  advanced formula patterns.

## See also

- [../reference/formula-schema.md](../reference/formula-schema.md) —
  the full formula spec.
- [../explanation/the-pour-pipeline.md](../explanation/the-pour-pipeline.md)
  — cook/pour/wisp semantics.

# Write a formula

A formula is a TOML workflow template. Covered at the concept level in
[../explanation/the-pour-pipeline.md](../explanation/the-pour-pipeline.md);
the full struct reference is
[../reference/formula-schema.md](../reference/formula-schema.md).

This doc shows how to author formulas that use the interesting
features: variables, conditions, loops, gates, composition.

## File location

Formulas live at:

1. `<beadsDir>/formulas/<name>.formula.toml` (project-level).
2. `~/.beads/formulas/<name>.formula.toml` (user-level).
3. `$GT_ROOT/.beads/formulas/<name>.formula.toml` (orchestrator).

Earlier paths shadow later. `bd formula list` resolves across all.

## Minimal formula

```toml
formula    = "mol-hello"
description = "Minimal example"
version    = 1
type       = "workflow"

[[steps]]
id    = "say-hi"
title = "Say hello"
```

Cook + pour:

```bash
bd pour mol-hello
```

## With variables

```toml
formula    = "mol-release"
description = "Cut a release"
version    = 1
type       = "workflow"

[vars]
version = { description = "Release version", required = true, pattern = "^\\d+\\.\\d+\\.\\d+$" }
channel = { description = "Release channel", default = "stable", enum = ["stable", "beta", "dev"] }
prerelease = { default = false, type = "bool" }

[[steps]]
id    = "changelog"
title = "Update CHANGELOG for {{version}}"

[[steps]]
id         = "tag"
title      = "Create git tag v{{version}} ({{channel}})"
depends_on = ["changelog"]
```

Shorthand: a bare string is a default.

```toml
[vars]
version = "1.0.0"   # shorthand for { default = "1.0.0" }
```

Pour with:

```bash
bd pour mol-release --var version=1.2.0 --var channel=beta
```

## With dependencies

`depends_on` lists sibling step IDs that must close first.

```toml
[[steps]]
id    = "a"
title = "Step A"

[[steps]]
id         = "b"
title      = "Step B"
depends_on = ["a"]

[[steps]]
id         = "c"
title      = "Step C — runs after A AND B"
depends_on = ["a", "b"]
```

`needs` is a peer alias for `depends_on` — either key works, and
the two are merged at cook time
(`internal/formula/types.go:220`). Pick one per formula for
consistency.

## With children (nested steps)

For epic-like hierarchies:

```toml
[[steps]]
id    = "prep"
title = "Prepare the release"
type  = "epic"

  [[steps.children]]
  id    = "changelog"
  title = "Update CHANGELOG"

  [[steps.children]]
  id         = "review"
  title      = "Review CHANGELOG"
  depends_on = ["changelog"]
```

## With a gate

Block a step on an external condition:

```toml
[[steps]]
id    = "publish"
title = "Publish release"
gate  = { type = "gh:run", await_id = "release.yml", timeout = "30m" }
```

On cook, a gate bead is created and wired to block `publish`. When the
GitHub run succeeds (`gh run view --json` status=completed,
conclusion=success), `bd gate check` closes the gate; publish
unblocks.

`await_id` is the canonical TOML key (maps directly to
`Issue.AwaitID`). The legacy `id` key still parses but new formulas
should use `await_id` (`internal/formula/types.go:279-292`).

Gate types: `gh:run`, `gh:pr`, `timer`, `human`, `mail`. See
[add-a-gate.md](add-a-gate.md).

## With conditional steps

```toml
[vars]
prerelease = { default = false, type = "bool" }

[[steps]]
id    = "announce-stable"
title = "Announce stable release"
condition = "{{prerelease == false}}"

[[steps]]
id    = "announce-beta"
title = "Announce beta release"
condition = "{{prerelease == true}}"
```

Steps whose `condition` evaluates false at cook time are dropped.

## With loops

```toml
[[steps]]
id    = "smoke-test"
title = "Smoke test iteration {{loop.index}}"

  [steps.loop]
  count = 3
```

Creates 3 beads at cook time.

Or over a range:

```toml
[[steps]]
id    = "check-env"
title = "Check {{item}}"

  [steps.loop]
  range = ["staging", "canary", "prod"]
```

## With on_complete (runtime fan-out)

Only works in graph-v2 contract (gascity-specific; beads itself
supports the schema but the runtime is gascity's):

```toml
[[steps]]
id    = "find-bugs"
title = "Find regression bugs"

  [steps.on_complete]
  for_each = "output.bugs"
  bond     = "mol-triage-bug"
  vars     = { bug_id = "{{item.id}}" }
```

At runtime, when `find-bugs` closes and emits `output.bugs = [...]`,
one `mol-triage-bug` molecule is poured per bug.

## With `extends` (inheritance)

Build on another formula:

```toml
formula = "mol-release-beta"
version = 1
extends = ["mol-release"]

[[steps]]
id         = "beta-qa"
title      = "Run beta QA suite"
depends_on = ["changelog"]
```

Child inherits vars + steps from parents. Overrides by step ID.

## With compose rules

For advanced composition — bond points, expansions, aspects:

```toml
formula = "mol-workflow-with-hooks"
version = 1
type    = "workflow"

[[steps]]
id    = "main-work"
title = "Main work"

[compose]

  [[compose.bond_points]]
  id         = "post-work"
  after_step = "main-work"

  [[compose.hooks]]
  trigger = "label:needs-review"
  attach  = "mol-code-review"
```

The `trigger` / `attach` hook attaches a review formula to any
beads with label `needs-review`.

## Phase: liquid vs vapor

```toml
formula = "mol-patrol"
version = 1
type    = "workflow"
phase   = "vapor"   # default is "liquid"
```

- `phase = "liquid"` (default) — pour creates persistent beads.
- `phase = "vapor"` — pour warns and suggests `bd mol wisp` instead;
  the formula is meant to run ephemerally.

`bd mol wisp` on a `vapor` formula creates a wisp (ephemeral, no Dolt
history). See [../explanation/the-pour-pipeline.md](../explanation/the-pour-pipeline.md).

## Pour: true vs false

```toml
formula = "mol-root-only"
version = 1
type    = "workflow"
pour    = false     # default is true
```

- `pour = true` — every step becomes a child bead.
- `pour = false` — only the root bead is created; steps are read
  inline at prime time (via `bd mol current`).

Use `pour = false` for formulas where many instances share the same
step text — avoids wisp-table growth.

## Validate before you pour

```bash
bd formula show mol-release    # parse + dump
bd cook mol-release --mode=runtime --var version=1.0.0 --dry-run
```

Formula.Validate (`internal/formula/types.go:549-666`) checks:

- Name, version ≥ 1, valid type.
- Vars: no `required:true` + `default` combo.
- Step IDs unique across whole formula.
- Title required unless `expand` used.
- Priority in [0,4].
- Dep refs exist.
- Waits-for target exists.
- Bond points: `after_step` XOR `before_step`.

## Gotchas

- **`pour` inline-cooks** — does NOT persist a proto bead unless you
  explicitly `bd cook --persist`.
- **`{{variable}}` substitution happens at cook time.** The cooked
  proto carries resolved titles/descriptions/metadata.
- **Convoy formulas have no runtime in beads.** Orchestrators (gastown,
  gascity) implement convoy execution; beads just stores the shape.
- **Gascity extends the schema** with fields beads doesn't have
  (`contract`, `ralph`, `retry`, `timeout` on steps). Gascity-specific
  formulas won't round-trip through `bd formula` if they use those
  fields.

## See also

- [../reference/formula-schema.md](../reference/formula-schema.md) —
  full field reference.
- [../explanation/the-pour-pipeline.md](../explanation/the-pour-pipeline.md)
  — cook / pour / wisp semantics.
- [../tutorials/03-pouring-a-formula.md](../tutorials/03-pouring-a-formula.md)
  — guided walkthrough.

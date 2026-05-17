# Formula schema

A formula is a workflow template stored as a TOML (preferred) or JSON
file, parsed into a Go struct, and "cooked" into proto beads for later
instantiation. The full struct lives at
`github/gastownhall/beads/internal/formula/types.go`.

Package-level doc
(`internal/formula/types.go:3-9`):

> Formulas are high-level workflow templates that compile down to proto
> beads. They support variable definitions with defaults and validation,
> step definitions that become issue hierarchies, composition rules for
> bonding formulas together, and inheritance via `extends`.

## Files

Extensions (`internal/formula/parser.go:16-20`):

- `.formula.toml` — preferred.
- `.formula.json` — legacy alias.

## Search paths

`formula.DefaultSearchPaths()` (`internal/formula/parser.go:64-97`)
resolves in this order (first match wins):

1. **Project**: `<resolved-beads-dir>/formulas/`.
2. **User**: `~/.beads/formulas/`.
3. **Orchestrator**: `$GT_ROOT/.beads/formulas/` (if `GT_ROOT` is set).

Later paths can be shadowed by earlier ones — the project-level name
wins over a user-level one.

## The four formula types

`FormulaType` at `types.go:35-62`:

| Type | Meaning |
|---|---|
| `workflow` | Standard sequence of steps. Most common. |
| `expansion` | Macro-template; `template:` steps replace a target during cook. |
| `aspect` | Cross-cutting concern via advice rules (`before`/`after`/`around`). |
| `convoy` | Multi-agent workflow. No dedicated runtime in beads; orchestrators implement it. |

## Root struct

`Formula` at `types.go:64-120`:

| Field | Type | Purpose |
|---|---|---|
| `formula` | string | Name. Convention: `mol-<name>` or `exp-<name>`. |
| `description` | string | |
| `version` | int | ≥ 1. |
| `type` | FormulaType | One of the four above. |
| `extends` | []string | Parent formulas inherited from; child overrides by step ID. |
| `vars` | map[string]*VarDef | Variable definitions (see below). |
| `steps` | []*Step | The work items. |
| `template` | []*Step | Alternate steps for `expansion` formulas. |
| `compose` | ComposeRules | Bond points, hooks, expand, map, branch, gate, aspects. |
| `advice` | []*AdviceRule | `before`/`after`/`around` (for aspect formulas). |
| `pointcuts` | []*Pointcut | Target patterns for aspect application. |
| `phase` | string | `"liquid"` (pour) or `"vapor"` (wisp). |
| `pour` | bool | If true, each step becomes a persistent child; if false, only root, steps read inline at prime time. |

## Variable definitions

`VarDef` at `types.go:122-143`. Shorthand (bare string = default):

```toml
[vars]
version = "1.0.0"
```

Full form:

```toml
[vars.version]
description = "Release version"
default = "1.0.0"
required = false
type = "string"
pattern = "^\\d+\\.\\d+\\.\\d+$"
```

`VarDef` fields:

- `description` — human-readable.
- `default` — a default value.
- `required` — must be supplied at cook time (`--var <name>=<value>`).
  Mutually exclusive with `default`.
- `enum` — allowed values.
- `pattern` — regex the value must match.
- `type` — hint for the UI: `string` / `path` / `enum` / `bool`.

`Formula.GetRequiredVars` (`types.go:800-808`) extracts required vars.
Cook / pour error out if any required var is missing, with a
`--var <name>=...` hint (`pour.go:181-191`).

## Step schema

`Step` at `types.go:190-269`. Fields:

- `id` — unique within the formula (including nested children;
  `collectChildIDs` at `types.go:661-685`).
- `title`, `description`, `notes` — content.
- `type` — `task` / `bug` / `feature` / `epic` / `chore`. Unknowns map
  to `task`.
- `priority` — 0-4 (validated at `types.go:585-587`).
- `labels`, `assignee`.
- `depends_on`, `needs` — sibling step IDs; merged at cook time.
- `waits_for` — `"all-children"` / `"any-children"` /
  `"children-of(step-id)"`. Adds a `gate:<value>` label.
- `expand` + `expand_vars` — inline another expansion formula.
- `condition` — skip unless `{{var}}` is truthy/equal
  (`FilterStepsByCondition`).
- `children` — nested steps for epic hierarchies.
- `gate` — async wait condition (see below).
- `loop` — `LoopSpec` (count / until / range + body).
- `on_complete` — `OnCompleteSpec` with `for_each` / `bond` / `vars`
  (runtime expansion over step output).
- `source_formula`, `source_location` — set during parse; propagated
  into the cooked issue for provenance.

## Gate

Per-step:

```go
type Gate struct {
    Type    string  // "gh:run", "gh:pr", "timer", "human", "mail"
    ID      string
    Timeout string
}
```
(`types.go:271-283`)

When `bd cook` sees a step with `gate:`, it creates a gate issue that
blocks the step. Closing the gate unblocks the step.

## Composition rules

`ComposeRules` at `types.go:386-414`:

- **`bond_points`** — named attachment sites. A bond point has `id`,
  `after_step` / `before_step` (mutually exclusive), and `parallel`.
- **`hooks`** (formula-side; NOT the same as `.beads/hooks/`) — trigger
  a formula attach based on a `label:` / `type:` / `priority:`
  condition.
- **`expand`** — apply an expansion to a specific step.
- **`map`** — apply an expansion to all steps matching a glob.
- **`branch`** — fork-join: `from` step → parallel `steps` → rejoin at
  `join`.
- **`gate`** — `GateRule` — add a condition to be satisfied before a
  step (distinct from the per-step `gate:` field).
- **`aspects`** — list of aspect formula names to apply.

## Example formula

```toml
formula    = "mol-release"
description = "Release workflow"
version    = 1
type       = "workflow"
phase      = "liquid"

[vars]
version = { description = "Release version", required = true, pattern = "^\\d+\\.\\d+\\.\\d+$" }

[[steps]]
id         = "changelog"
title      = "Update CHANGELOG for {{version}}"
type       = "task"

[[steps]]
id         = "tag"
title      = "Create git tag v{{version}}"
depends_on = ["changelog"]

[[steps]]
id         = "publish"
title      = "Publish release"
depends_on = ["tag"]
gate       = { type = "gh:run", id = "release.yml", timeout = "30m" }

[[steps]]
id         = "announce"
title      = "Announce in #releases"
depends_on = ["publish"]
```

## Validation

`Formula.Validate` at `types.go:540-657` enforces:

- Name, version ≥ 1, valid type.
- Var can't have both `required:true` AND `default`.
- Step IDs unique across the whole formula (nested too).
- `title` required unless `expand` is used.
- Priority in `[0, 4]`.
- `depends_on` / `needs` references exist.
- `waits_for` value matches a known pattern; target exists.
- `on_complete.for_each` starts with `output.`; `parallel` /
  `sequential` mutually exclusive.
- Bond points: `after_step` and `before_step` mutually exclusive; anchor
  exists.
- Hooks: `trigger` + `attach` both required.

## Inheritance via `extends`

```toml
formula = "mol-release-beta"
extends = ["mol-release"]

[[steps]]
id = "qa-beta"
title = "Run beta QA suite"
depends_on = ["changelog"]
```

The child inherits vars and steps from parents, and overrides by ID
(same step `id` in child replaces the parent's). `Resolve` in
`internal/formula/compile.go` walks the inheritance chain.

## Cooking and pouring

See [../how-to/write-a-formula.md](../how-to/write-a-formula.md) for a
worked example.

Summary of the compilation pipeline
(`internal/formula/compile.go`):

1. Load (search-path resolution).
2. Resolve inheritance (`extends`).
3. Apply control-flow (`loop`, `branch`, `gate`).
4. Apply advice (before/after/around).
5. Apply inline expansions (`expand` on steps).
6. Apply `compose.expand` and `compose.map`.
7. Load + apply aspects.
8. Filter by `condition`.
9. Materialize expansions.
10. (gascity only, contract=graph.v2) apply retries, apply ralph,
    inject graph controls.
11. Flatten to a `Recipe` (gascity term; beads flattens to its own
    structure).

## Orchestrator-specific differences

- **Beads** ships the core formula compiler, validation, and
  search paths described above.
- **Gastown** embeds its own formulas via `go:embed` at build time
  (`internal/formula/embed.go`) — release, security-audit, etc. At
  runtime gastown uses the beads search paths for user-authored
  formulas.
- **Gascity** has a complete, parallel formula compiler in
  `internal/formula/`. Its `Formula` struct has a `Contract` field
  (`"graph.v2"` opts into graph-first semantics) that beads doesn't
  have. Gascity formulas can also declare `ralph`, `retry`, and
  `timeout` on steps. See
  [../../05-gascity-integration.md](../../05-gascity-integration.md) §4.

The TOML format is shared at the root; gascity extends the schema with
additional step fields and a `contract` key. If beads grows equivalent
features, the two compilers could drift.

## See also

- [bead-schema.md](bead-schema.md) — the bead that each step becomes.
- [dependency-types.md](dependency-types.md) — edges the cook creates
  between steps.
- [../how-to/write-a-formula.md](../how-to/write-a-formula.md) — guided
  recipe.
- [../explanation/the-pour-pipeline.md](../explanation/the-pour-pipeline.md)
  — formula → proto → molecule/wisp lifecycle.

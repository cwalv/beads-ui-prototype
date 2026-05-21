---
id: formulas
title: Formulas
sidebar_position: 3
---

# Formulas

Formulas are declarative workflow templates.

## Formula Format

Formulas can be written in TOML (preferred) or JSON:

### TOML Format

```toml
formula = "feature-workflow"
description = "Standard feature development workflow"
version = 1
type = "workflow"

[vars.feature_name]
description = "Name of the feature"
required = true

[[steps]]
id = "design"
title = "Design {{feature_name}}"
type = "human"
description = "Create design document"

[[steps]]
id = "implement"
title = "Implement {{feature_name}}"
needs = ["design"]

[[steps]]
id = "review"
title = "Code review"
needs = ["implement"]
type = "human"

[[steps]]
id = "merge"
title = "Merge to main"
needs = ["review"]
```

### JSON Format

```json
{
  "formula": "feature-workflow",
  "description": "Standard feature development workflow",
  "version": 1,
  "type": "workflow",
  "vars": {
    "feature_name": {
      "description": "Name of the feature",
      "required": true
    }
  },
  "steps": [
    {
      "id": "design",
      "title": "Design {{feature_name}}",
      "type": "human"
    },
    {
      "id": "implement",
      "title": "Implement {{feature_name}}",
      "needs": ["design"]
    }
  ]
}
```

## Formula Types

| Type | Description |
|------|-------------|
| `workflow` | Standard step sequence |
| `expansion` | Template for expansion operator |
| `aspect` | Cross-cutting concerns |
| `convoy` | Multi-agent workflow coordinating parallel workers |

## Formula-Level Fields

Top-level fields on a formula (source: `internal/formula/types.go:65-120`):

| Field | Type | Description |
|-------|------|-------------|
| `formula` | string | Unique name. Convention: `mol-<name>` for workflows, `exp-<name>` for expansions. |
| `version` | int | Schema version. Must be ≥ 1. Currently always `1`. |
| `type` | enum | One of `workflow`, `expansion`, `aspect`, `convoy`. |
| `description` | string | Human-readable explanation of the formula. |
| `extends` | []string | Parent formulas to inherit from. Child definitions override parent defs with the same ID. |
| `vars` | map | Variable definitions (see [Variables](#variables) below). |
| `steps` | []Step | Work items to create on instantiation. |
| `template` | []Step | Expansion template steps (for `expansion`-type formulas). Uses `{target}` placeholder. |
| `compose` | ComposeRules | Bond points, hooks, expand/map rules, branch, gate, aspects. |
| `advice` | []AdviceRule | Step transformations (before/after/around); used by aspect formulas. |
| `pointcuts` | []Pointcut | Target patterns for aspect application (glob, type, label). |
| `phase` | enum | `"liquid"` (pour) or `"vapor"` (wisp). Declares the intended instantiation path. `bd mol pour` warns if this is `"vapor"`; `bd mol wisp` is silent regardless of phase. |
| `pour` | bool | Controls step materialization under `bd mol wisp`. If `true`, each step becomes a persistent child issue. If `false` (default), `bd mol wisp` creates **root only** and reads steps inline at prime time. `bd mol pour` always materializes children regardless of this field. |

### `pour` and `phase` interaction

```
Formula phase  │  Command used    │  Result
───────────────┼──────────────────┼──────────────────────────────────────
vapor          │  bd mol pour     │  Creates all steps + warns "consider bd mol wisp"
vapor          │  bd mol wisp     │  Creates root only (if pour=false), or all steps (if pour=true)
liquid         │  bd mol pour     │  Creates all steps, no warning
liquid         │  bd mol wisp     │  Creates root only (if pour=false), or all steps (if pour=true). No warning.
(unset)        │  bd mol wisp     │  Root only by default (pour=false default). Set pour=true to materialize steps.
```

Key rule: `phase` is a recommendation enforced only at `bd mol pour` time (warns on vapor).
`pour=true` is what actually controls whether `bd mol wisp` materializes child steps — without it,
wisp always creates the root issue only, regardless of phase.

Reserve `pour=true` for infrequent, high-value workflows (e.g. releases) where per-step DB rows
and checkpoint recovery are worth the overhead. Patrol and routine operational formulas should
leave `pour` unset (default false).

## Variables

Define variables with defaults and constraints:

```toml
[vars.version]
description = "Release version"
required = true
pattern = "^\\d+\\.\\d+\\.\\d+$"

[vars.environment]
description = "Target environment"
default = "staging"
enum = ["staging", "production"]
```

Use variables in steps:

```toml
[[steps]]
title = "Deploy {{version}} to {{environment}}"
```

## Step Types

| Type | Description |
|------|-------------|
| `task` | Normal work step (default) |
| `human` | Requires human action |
| `gate` | Async coordination point |

## Dependencies

### Sequential

```toml
[[steps]]
id = "step1"
title = "First step"

[[steps]]
id = "step2"
title = "Second step"
needs = ["step1"]
```

### Parallel then Join

```toml
[[steps]]
id = "test-unit"
title = "Unit tests"

[[steps]]
id = "test-integration"
title = "Integration tests"

[[steps]]
id = "deploy"
title = "Deploy"
needs = ["test-unit", "test-integration"]  # Waits for both
```

## Gates

Add gates for async coordination:

```toml
[[steps]]
id = "approval"
title = "Manager approval"
type = "human"

[steps.gate]
type = "human"
approvers = ["manager"]

[[steps]]
id = "deploy"
title = "Deploy to production"
needs = ["approval"]
```

## Aspects (Cross-cutting)

Apply transformations to matching steps:

```toml
formula = "security-scan"
type = "aspect"

[[advice]]
target = "*.deploy"  # Match all deploy steps

[advice.before]
id = "security-scan-{step.id}"
title = "Security scan before {step.title}"
```

## Formula Locations

Formulas are searched in order:
1. `.beads/formulas/` (project-level)
2. `~/.beads/formulas/` (user-level)
3. Built-in formulas

## Using Formulas

```bash
# List available formulas (bd formula list, not bd mol list — bd mol list does not exist)
bd formula list
bd formula list --type workflow

# Inspect a formula
bd formula show <formula-name>

# Pour formula into persistent molecule (all steps materialized)
bd mol pour <formula-name> --var key=value

# Create ephemeral wisp (root only by default; set pour=true in formula for all steps)
bd mol wisp <formula-name> --var key=value

# Preview what would be created
bd mol pour <formula-name> --dry-run
bd mol wisp <formula-name> --dry-run
```

## Creating Custom Formulas

1. Create file: `.beads/formulas/my-workflow.formula.toml`
2. Define structure (see examples above)
3. Use with: `bd mol pour my-workflow` (persistent) or `bd mol wisp my-workflow` (ephemeral)

## Example: Release Formula

```toml
formula = "release"
description = "Standard release workflow"
version = 1

[vars.version]
required = true
pattern = "^\\d+\\.\\d+\\.\\d+$"

[[steps]]
id = "bump-version"
title = "Bump version to {{version}}"

[[steps]]
id = "changelog"
title = "Update CHANGELOG"
needs = ["bump-version"]

[[steps]]
id = "test"
title = "Run full test suite"
needs = ["changelog"]

[[steps]]
id = "build"
title = "Build release artifacts"
needs = ["test"]

[[steps]]
id = "tag"
title = "Create git tag v{{version}}"
needs = ["build"]

[[steps]]
id = "publish"
title = "Publish release"
needs = ["tag"]
type = "human"
```

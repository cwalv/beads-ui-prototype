# Create beads from markdown

`bd create --file <path>` ingests a markdown file containing one or
more beads.

## File format

Each bead is one `## Issue Title` block, followed by optional
`### Section` subsections. All beads in one file get committed in a
single Dolt commit.

```markdown
## First bead title

Optional description before any `###` becomes the description.

### Priority
2

### Type
feature

### Description
Detailed description. Multiple paragraphs OK.

### Design
Design notes.

### Acceptance Criteria
- Bullet one.
- Bullet two.

### Assignee
alice

### Labels
backend, auth

### Dependencies
bd-10, bd-20
```

## Sections

Recognized (`cmd/bd/markdown.go:68-102`):

- `priority` — int 0-4 or `P0-P4`.
- `type` — bug/feature/task/epic/chore/decision/message/story/milestone/spike.
- `description` — overrides the pre-`###` body.
- `design`, `notes`, `acceptance criteria`/`acceptance`.
- `assignee`, `labels`.
- `dependencies`/`deps`.

Section order is arbitrary. Missing sections fall back to bd defaults.

## Dependencies

Entries in the `### Dependencies` section:

```
bd-10                          # defaults to blocks
bd-10, bd-20                   # multiple, all blocks
blocks:bd-10, related:bd-20    # explicit type per entry
```

Dep types: any of the 20 well-known types (see
[../reference/dependency-types.md](../reference/dependency-types.md)).

## Multi-bead file

```markdown
## Implement SSO

### Type
feature

### Description
Integrate with Okta SAML.

---

## Write SSO tests

### Type
task

### Description
Integration tests for SSO.

### Dependencies
blocks:implement-sso
```

The IDs are assigned at import. To cross-reference inside the file,
use the **slugified title** — e.g., `implement-sso` refers to the
first bead. bd resolves at import time (`cmd/bd/markdown.go:345-376`).

## Commands

```bash
# Create from file
bd create --file plan.md

# Preview without creating (JSON)
bd create --file plan.md --dry-run --json

# Custom commit message
bd create --file plan.md --message "bd import: 2026-q2 roadmap"
```

## Validation

Per-bead validation: title required, priority in [0,4], dep references
resolvable. Errors fail the whole file — nothing is created.

Enable section-required linting:

```bash
bd config set validation.on-create warn
bd create --file plan.md --validate
# emits warnings for missing Required Sections per type
```

See [../reference/status-lifecycle.md](../reference/status-lifecycle.md#required-sections)
for per-type section requirements.

## See also

- [create-a-graph.md](create-a-graph.md) — atomic graph creation via
  JSON plan (richer than markdown for DAG shapes).
- [../reference/bd-commands.md#issue-lifecycle](../reference/bd-commands.md#issue-lifecycle)
  — `bd create` reference.

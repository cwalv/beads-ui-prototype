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

Recognized (`processIssueSection` in `cmd/bd/markdown.go`):

- `priority` — parsed via `validation.ParsePriority`: accepts int
  `0-4` or `P0-P4`.
- `type` — parsed via `validation.ParseIssueType`; invalid values
  fall back to `task` with a stderr warning.
- `description` — overrides the pre-`###` body.
- `design`.
- `acceptance criteria` / `acceptance` (alias).
- `assignee`.
- `labels`.
- `dependencies` / `deps` (alias).

There is no `notes` section in the current parser. Unrecognized
section names are silently ignored. Section order is arbitrary;
missing sections fall back to bd defaults (`priority=2`, `type=task`).

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
blocks:bd-abc123
```

All beads in one file commit together via `store.CreateIssues`
followed by a single `bd: create N issue(s) from <path>` commit.
Cross-references inside a single file must use an existing bead ID
(`bd-...`) — the parser does not synthesize symbolic / slug-based
keys. For symbolic cross-references inside one batch, use
[create-a-graph.md](create-a-graph.md).

## Commands

```bash
# Create from file
bd create --file plan.md
bd create -f plan.md         # short form
```

`--dry-run` is rejected when `--file` is supplied (see
`cmd/bd/create.go`: "--dry-run is not supported with --file flag").
The commit message is fixed to `bd: create N issue(s) from <path>`;
there is no `--message` flag on `bd create`.

## Validation

Per-bead validation is delegated to the regular create path: title
required, priority in `[0,4]`, dep type valid. Errors fail the whole
file — nothing is created (the batch goes through one
`store.CreateIssues` call).

Enable section-required linting via the `--validate` flag (also
triggered by `validation.on-create=warn|error`):

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

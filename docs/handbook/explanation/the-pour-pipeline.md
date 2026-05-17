# The pour pipeline

From a formula file on disk to a running workflow.

## The three shapes

At any point in a workflow's life, it's one of three things:

| Shape | What it is | Where it lives |
|---|---|---|
| **Formula** | TOML template file | `.beads/formulas/<name>.formula.toml` |
| **Proto** | Compiled template bead | Issue with `is_template=true`, in `.beads/molecules.jsonl` or the `issues` table |
| **Molecule / wisp** | Running instance | Child beads in `issues` (molecule) or `wisps` (wisp) |

Operations move between shapes:

```
  formula file ──cook──▶ proto ──pour──▶ molecule (persistent children)
                          │
                          └──wisp──▶ wisp (ephemeral children)
```

## Formulas

A formula is authored text. Minimal example:

```toml
formula    = "mol-release"
description = "Cut a release"
version    = 1
type       = "workflow"

[vars]
version = { required = true, pattern = "^\\d+\\.\\d+\\.\\d+$" }

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
```

Formulas live in `.beads/formulas/` (project), `~/.beads/formulas/`
(user), or `$GT_ROOT/.beads/formulas/` (orchestrator). See
[../reference/formula-schema.md](../reference/formula-schema.md) for the
full field set.

Four formula types:

- **`workflow`** — sequential-or-DAG step list. Most formulas.
- **`expansion`** — a macro; `template:` steps substitute into a
  target step.
- **`aspect`** — cross-cutting concerns via advice (`before`/`after`/
  `around` rules).
- **`convoy`** — multi-agent coordination. Named here; runtime lives
  in orchestrators.

## Cook

`bd cook <formula>` compiles a formula into a proto. Two modes:

- **Compile mode** (`--mode=compile`, default): keep `{{variable}}`
  placeholders. Useful for planning, estimation, and contractor
  handoff — the template doesn't commit to variable values yet.
- **Runtime mode** (`--mode=runtime` or any `--var` flag): substitute
  variables; error if any required var is missing.

By default, cook outputs JSON to stdout — the proto is ephemeral.
`--persist` writes it as a template bead to the DB, marked
`is_template=true`.

Compilation pipeline (`internal/formula/compile.go`):

1. Load by name.
2. Resolve `extends` (inheritance).
3. Expand control flow (`loop`, `branch`, `gate`).
4. Apply advice (before/after/around).
5. Apply inline expansions (`expand` on steps).
6. Apply `compose.expand` / `compose.map`.
7. Apply aspects.
8. Filter by `condition`.
9. Materialize expansions.

Result: a tree of step specs with provenance (source formula and
line), ready to instantiate.

## Protos

A proto is the compiled output. Whether it's in memory or in the DB
depends on `--persist`:

- **Ephemeral proto** (default) — cooked inline by `bd pour` or
  `bd wisp`; never persists on its own.
- **Persistent proto** — with `--persist`, a bead is written with
  `is_template=true`, the `template` label, and children for each
  step. Excluded from `bd list` by default. Reusable: multiple pours
  from the same proto.

Either way, a proto is a read-only blueprint, not a work item.

## Pour

`bd pour <name-or-id>` instantiates a proto as a persistent molecule:

```
$ bd pour mol-release --var version=1.2.0
Created molecule bd-mol-abc with 3 steps
```

What happens (`cmd/bd/pour.go:51-255`):

1. Try to resolve the argument as a formula name. If yes, cook inline
   (ephemeral proto, never persists).
2. Otherwise, look up as an existing proto bead.
3. If `phase="vapor"`, warn and suggest `bd mol wisp` instead.
4. Resolve `--attach` protos (for compound molecules).
5. Apply variable defaults; error if any required var is missing.
6. `spawnMolecule(..., ephemeral=false, prefix=IDPrefixMol)` — each
   step becomes a child bead with prefix `mol` (e.g. `bd-mol-abc`).

The resulting bead graph has one root (type=`molecule`) and N step
beads as children connected by `depends_on` edges.

## Wisp

`bd mol wisp <name-or-id>` is the ephemeral analog:

```
$ bd mol wisp mol-patrol --var target=api-service
Created wisp bd-wisp-xyz
```

Same spawn mechanism as `pour` but each step is marked
`Ephemeral=true` — routed to the `wisps` table, not `issues`.
Not synced via git; eligible for TTL-based compaction.

Wisps use prefix `wisp` (e.g. `bd-wisp-xyz`).

### Wisp lifecycle

```
create ─▶ execute ─▶ squash (promote to persistent with digest)
                    │
                    └▶ burn (delete without digest)
```

- `bd mol squash <id>` — promote to persistent, produce a digest.
- `bd mol burn <id>` — delete without history.

Automatic TTL compaction via `wisp_type`:

| `wisp_type` | TTL |
|---|---|
| `heartbeat`, `ping` | 6h |
| `patrol`, `gc_report` | 24h |
| `recovery`, `error`, `escalation` | 7d |

The TTL policy is described in `WISP-COMPACTION-POLICY.md` referenced
in `internal/types/types.go:667`.

## Running a molecule

Once instantiated, step beads execute in dependency order.

`bd mol current <mol-id>` reports step state per bead:

- `done` — closed.
- `current` — in_progress.
- `ready` — open, all `blocks` deps satisfied.
- `blocked` — open, at least one `blocks` dep still open.

`bd mol progress <mol-id>` reports aggregate counts + ETA from close
timestamps.

Workers typically:

1. Query `bd mol current <mol-id> --json`.
2. Claim the first `ready` step (`bd update --claim`).
3. Execute, close.
4. Repeat until `bd mol current` shows no ready steps.

### Discovering running molecules

The `bd mol *` subcommands all take a `<mol-id>` argument — but how do you
get the mol-id in the first place? **There is no canonical one-liner.**
`bd mol list` does not exist (despite stale advice text in
`cmd/bd/doctor/agent.go:520` referencing it). The realistic answer is
multi-tier, ordered by specificity:

1. **`bd list --type=molecule --status=in_progress`** — works only if the
   workspace registered `molecule` as a custom type via
   `bd config set types.custom`. Gascity does this by convention; bare bd
   does not by default. (Note: `molecule` was *removed* from beads-core's
   built-in type set — `internal/types/types.go:543-547` — so this
   filter only matches workspaces that explicitly opted in.)

2. **`bd list --mol-type=swarm,patrol,work --status=in_progress`** — works
   only if `mol_type` was *explicitly set* on the bead at create time
   via `bd create --mol-type=...`. `bd pour` does **not** auto-set
   `mol_type` from the formula. Most molecules in practice have
   `mol_type=""`, so this filter is sparse unless your conventions
   explicitly set it.

3. **`bd list --type=epic --status=in_progress`** — universal fallback if
   formulas use `type=epic` for the root step. Mixes epic semantics with
   molecule semantics; works whenever the formula's root step uses the
   built-in `epic` type.

4. **ID prefix `bd-mol-*`** — the actual structural marker. `pour.go`
   sets `IDPrefixMol = "mol"` so every poured root carries this prefix
   (e.g., `bd-mol-abc`). Wisps similarly carry `IDPrefixWisp = "wisp"`.
   `bd list` has no prefix-match flag (`--id` takes a comma-separated
   exact-match list, not a glob), so this requires a client-side filter
   — e.g., `bd list --status=in_progress --json | jq '.[] | select(.id | startswith("bd-mol-"))'`.

In practice, pack authors and tooling builders combine these: try
custom-type first, fall back through `mol-type` and ID prefix as the
schema permits. Documented as a real gap in `gaps-audit.md` §C13.

## Root-only vs pour semantics

Some formulas set `pour = false`, which behaves differently:

- **`pour = true`** (default) — every step becomes a child bead. The
  molecule DAG is materialized.
- **`pour = false`** — only the root bead is created; steps are read
  inline from the embedded formula at prime time. No child beads.

Root-only is useful for:

- Avoiding wisp-table growth when many molecules share identical
  step text.
- Making step changes on a formula propagate immediately without
  re-pouring every instance.

Gastown's documentation calls this the "root-only wisp" mode
(`docs/concepts/molecules.md`). Gascity uses the same distinction but
with the `Contract` field driving the decision.

## Bonding

`bd mol bond <A> <B>` merges protos or molecules into a compound.
`A` and `B` can each be a formula name, proto id, or molecule id.

Bond types:

- `sequential` (default) — B runs after A.
- `parallel` — B alongside A.
- `conditional` — B only if A fails.
- `root` — marks the primary/root component.

Compounds carry provenance in `Issue.BondedFrom` (included in the
content hash).

## Distill

`bd mol distill <epic-id>` goes the other direction: it extracts a
reusable proto from an ad-hoc epic. Useful when an epic turned out to
be worth templating for reuse.

## Orchestrator-specific flavors

### Gastown

- Formulas are embedded at build time (`internal/formula/embed.go`),
  but gastown uses beads's search paths for user-authored ones.
- `gt mol attach` is the gastown-side pour-like command (per
  [../../gaps-audit.md](../../gaps-audit.md) §A8).
- Polecats use `hook_bead` + checkpoint files to recover workflow
  state across sessions.

### Gascity

- Has its own parallel formula compiler
  (`gascity/internal/formula/`) that adds a `Contract` field
  (`graph.v2` opts into graph-first semantics).
- `gc sling --formula` invokes gascity's compiler + `molecule.Cook`.
  Does NOT call `bd mol cook`.
- Uses bd's `bd mol current` for runtime step tracking. Compile is
  gascity; step tracking is beads.
- Wisps are tied to `gc.continuation_group` metadata — a
  continuation group pours a new wisp per iteration.

Format drift risk: gascity and beads both parse the TOML format, and
gascity has been extending its schema independently. See
[../../gaps-audit.md](../../gaps-audit.md) §A8 for the flag.

## Vestigial / watch out

- **Built-in molecules are empty.** `getBuiltinMolecules()` returns
  `nil`. A fresh beads install has zero templates until you
  provide them yourself or your orchestrator embeds them.
- **`bd mol squash` vs `bd mol burn`** — easy to confuse. Squash
  preserves a digest; burn deletes.
- **`pour` warns when formula phase is `vapor`** but `wisp` does
  NOT warn when phase is `liquid`. See
  [../../gaps-audit.md](../../gaps-audit.md) §C12.
- **`gc sling --formula`** in gascity doesn't go through `bd pour`;
  it uses gascity's own compile + graph-apply path.

## See also

- [../reference/formula-schema.md](../reference/formula-schema.md) —
  formula field reference.
- [../reference/bd-commands.md](../reference/bd-commands.md#formulas-and-molecules)
  — pour / wisp / mol command catalog.
- [../how-to/write-a-formula.md](../how-to/write-a-formula.md) —
  guided formula authoring.

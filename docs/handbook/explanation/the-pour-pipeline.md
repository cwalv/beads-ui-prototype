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

Compilation pipeline (`cmd/bd/cook.go:676` — `resolveAndCookFormulaWithVars`; transforms live in `internal/formula/`):

1. Load by name (`formula.NewParser` → `LoadByName`).
2. Resolve `extends` (inheritance).
3. Expand control flow (`loop`, `branch`, `gate`) via `formula.ApplyControlFlow`.
4. Apply advice (before/after/around) via `formula.ApplyAdvice`.
5. Apply inline expansions (`expand` on steps) via `formula.ApplyInlineExpansions`.
6. Apply `compose.expand` / `compose.map` via `formula.ApplyExpansions`.
7. Apply aspects (advice imported from `compose.aspects`).
8. Filter by `condition` via `formula.FilterStepsByCondition`.
9. Materialize standalone expansion formulas via `formula.MaterializeExpansion`.

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

What happens (`cmd/bd/pour.go:51-255` — `runPour`):

1. Try to resolve the argument as a formula name. If yes, cook inline
   (ephemeral proto, never persists).
2. Otherwise, look up as an existing proto bead.
3. If `phase="vapor"`, warn and suggest `bd mol wisp` instead.
4. Resolve `--attach` protos (for compound molecules).
5. Apply variable defaults; error if any required var is missing.
6. `spawnMolecule(..., ephemeral=false, prefix=types.IDPrefixMol)` — each
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
in `internal/types/types.go:671`.

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

1. **`bd list --type=molecule --status=in_progress`** — `molecule` and
   `gate` were re-promoted to beads-core's built-in type set
   (`internal/types/types.go:531-532`, comment at 547-549). The proto
   root is created with `IssueType: types.TypeMolecule` by
   `cookFormula` (`cmd/bd/cook.go:445-456`), and `cloneSubgraph` copies
   that type verbatim onto the poured root (`cmd/bd/template.go:593`).
   So this filter works out of the box on a bare bd workspace — any
   bead poured via `bd pour` or `bd mol wisp` whose proto came from a
   formula will surface here.

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

In practice, pack authors and tooling builders combine these: prefer
the `--type=molecule` filter (now built-in) and fall back to
`mol-type` or the ID prefix when the workflow needs finer
categorization. Documented as a real gap in `gaps-audit.md` §C13.

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

Gascity carries a parallel formula compiler at
`github/gastownhall/gascity/internal/formula/`. beads stays minimal so
any orchestrator can wrap it; gascity layers graph-first semantics on
top of beads's TOML format and bead-graph runtime. The sections below
read gascity's compiler as evidence for what those semantics *cost* —
the substrate is still beads.

#### Why a parallel compiler

bd's compiler ignores `gc.*` step metadata; gascity's reads it and
emits additional graph nodes. The metadata-driven keys that gascity
treats as load-bearing are listed in
`internal/formula/types.go:942-957` (`metadataRequiresGraphContract`):
`gc.kind` values `scope`/`cleanup`/`scope-check`/`workflow-finalize`/
`retry`/`retry-run`/`retry-eval`/`ralph`/`run`/`check`, plus
`gc.scope_name`/`gc.scope_role`/`gc.scope_ref`/`gc.continuation_group`/
`gc.on_fail`. Any of these forces an explicit `contract = "graph.v2"`
declaration; legacy formulas without these keys still compile through
bd's hierarchy-first path.

Routing-side keys are read separately by the dispatcher:
`gc.run_target` and `gc.routed_to` at
`internal/dispatch/fanout.go:306-308`, with `gc.execution_routed_to`
for control-bead split routing at `internal/graphroute/graphroute.go:19`.
`gc.output_json_schema` is *declared* (e.g., `mol-review-quorum.toml:102`)
and `gc.output_json_required` *is* checked for non-empty at
`internal/dispatch/retry.go:235`, but the schema name itself is not
validated against any registry — declaring a schema does not enforce it.

#### The `Contract` field

The opt-in is a single string on the formula root:
`formula.Contract` at `internal/formula/types.go:78-80`. The only
recognized value is `"graph.v2"` (`internal/formula/types.go:971`,
`internal/formula/compile.go:518-520`). When set, the compiler emits
graph-control beads — fanout, scope-check, workflow-finalize,
retry, retry-eval — instead of a hierarchical molecule tree
(`internal/formula/graph.go:35,70,108`). Without `graph.v2`, a formula
that uses graph-only constructs (e.g., `[steps.retry]` blocks or any
of the metadata keys listed above) is rejected at validate time
(`internal/formula/types.go:974-976`). graph.v2 is also gated by a
daemon-level toggle, `IsFormulaV2Enabled`
(`internal/formula/compile.go:500-516`).

#### Sling-attach vs pour

Two entry points produce molecules. `bd pour` instantiates a proto
exactly as compiled and does not stamp routing. `gc sling --formula`
runs gascity's compiler and then *decorates* the recipe before
instantiation: `internal/sling/sling.go:1095-1117` calls
`ApplyGraphRouting`, which for graph.v2 recipes delegates to
`DecorateGraphWorkflowRecipe`
(`internal/graphroute/graphroute.go:398-472`). Decoration substitutes
`{{var}}` placeholders in each step's `gc.run_target`, resolves the
target to an agent, and stamps `gc.routed_to` on every non-root,
non-topology step (`internal/graphroute/graphroute.go:137-149`); legacy
recipes get a uniform stamp from `stampLegacyRecipeRouting`
(`internal/graphroute/graphroute.go:533-551`). Production workflows
that need per-step routing land via sling; `bd pour` is for tests and
one-off runs that do not need routing decoration.

#### Pools as routing targets

`gc.routed_to` names an *agent config* — either an inline `[[agent]]`
in `city.toml` or a pool-expanded variant — qualified as `rig/agent`.
Sizing keys (`max_active_sessions`, `min_active_sessions` at
`internal/config/config.go:1784-1787`) replace the older
`[pool]` shape. Routing semantics are then implemented by the
work-query script every session runs:
`internal/config/config.go:2153-2185` (`EffectiveWorkQuery`) checks
`bd ready --metadata-field gc.routed_to=<qualified-name> --unassigned`
in tier 3, so a stamped step appears as queued work for any matching
pool member. Because `gc.routed_to` is per-step, a single workflow can
fan out across pools — for example, body steps routed to
`foundations/worker` and a merge step routed to
`foundations/refinery` — purely through the decoration pass; the
beads-graph runtime is unaware that "routing" exists.

#### Wisps and `gc.continuation_group`

Continuation groups are gascity's *intended* session-affinity primitive:
beads in the same group should be processed by the same live worker
session so context is not re-paid. The mechanism is documented in the
worker prompt at
`internal/bootstrap/packs/core/assets/prompts/graph-worker.md:77-102`,
which instructs a worker that claims a bead to look up its
`gc.continuation_group` and pre-assign every open sibling in the same
group to its own session — effectively a worker-driven implementation.

As of 2026-05 the dispatcher does **not** enforce this contract: a
worker in a different rig or workweave can still claim the next ready
bead in the group, because no code in `internal/dispatch/` reads
`gc.session_affinity`. The known gap is tracked in
`fo-session-affinity-not-enforced`. Treat `gc.continuation_group` as
guidance-with-cooperation, not a fence.

#### The body / cleanup split

`gc.kind` partitions a graph.v2 workflow into role-shaped steps:
`body` work (members that do the job), `scope` (a latch bead wrapping
body members until they all close), `cleanup` (teardown work, marked
`gc.scope_role = "teardown"` so it is exempt from scope-check gating —
`internal/dispatch/control.go:583-585`,
`internal/formula/graph.go:121-122`), and a family of *control* kinds
(`scope-check`, `fanout`, `workflow-finalize`, `retry`, `retry-eval`,
`ralph`, `check`) that route to the implicit control-dispatcher session
(`internal/graphroute/graphroute.go:55-62`). The split matters because
a cleanup step can observe whether the body succeeded; the dispatcher
treats teardown as "always execute when ready," which lets a formula
say "tear down the workweave only on confirmed success" rather than
entangling cleanup with the body's retry loop.

#### Durable vs experimental (as of 2026-05)

graph.v2 as a *full contract surface* is not yet load-bearing in
production. The durable subset to build against is:

- `bd pour` for ordinary workflows.
- `gc sling --formula <target> <name>` for routed launches.
- Named pools sized via `max_active_sessions` / `min_active_sessions`.
- `foundations/refinery` for routine merges.
- Wisps for SME / worker iteration, with `gc.continuation_group`
  treated as a hint.
- `mol-weave-work-sp` — the single-pool variant — compiles and runs
  but pays a per-step session-spawn cost.

Known gaps to design *around*, not on:

- `gc.session_affinity = "require"` is unenforced
  (`fo-session-affinity-not-enforced`).
- Retry materialization drops body / routing metadata
  (`fo-ybvmi`), so a retried attempt may need to re-derive context
  the original carried.
- `gc.output_json_schema` is declared but never validated against a
  registry; only `gc.output_json_required` (existence) is checked
  (`internal/dispatch/retry.go:235`).

#### Format-drift risk

gascity and beads both parse the same TOML format, and gascity has
been extending its schema (notably `contract`, `[steps.retry]`,
`[steps.on_complete]`, and the `gc.*` metadata family) independently
of beads. Step snapshots that round-trip through `bd` survive
unchanged today, but a beads-side change to the formula schema does
not automatically propagate. The flag is tracked in
[../../gaps-audit.md](../../gaps-audit.md) §A8.

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

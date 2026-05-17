# Beads concepts

This doc catalogues the conceptual layers that ship with `beads` (the `bd`
binary) and classifies each as **beads core**, **orchestrator-only** (the
concept exists in gastown / gascity but not here), or **partial** (beads has
hooks for it; real implementation lives in an orchestrator).

Scope: only the `github/gastownhall/beads/` repo. Data-model details live in
`01-data-model.md`; CLI flags live in `02-cli-surface.md`. This doc is the
"one level above data-model" lens — what the concepts mean, how they relate,
and where they are (or are not) implemented.

Code is authoritative. Every non-trivial claim cites `path:line`.

## At-a-glance

| Concept | In beads? | Key implementation | Notes |
|---|---|---|---|
| Formula | yes | `internal/formula/` | Workflow template files, four kinds (workflow, expansion, aspect, convoy). Cooked into protos. |
| Molecule (proto / pour / wisp) | yes | `internal/molecules/`, `cmd/bd/mol.go`, `pour.go`, `wisp.go` | Template issues with `is_template=true` + `mol_type` (swarm / patrol / work). Cooked formulas become protos; protos instantiated as persistent mols or ephemeral wisps. |
| Recipe | yes (but not about work) | `internal/recipes/` | AI-tool integration (where to write CLAUDE.md / AGENTS.md / hooks for various IDEs). Not a work-tracking concept. |
| Mail / message | partial | `cmd/bd/mail.go`, `IssueType = "message"` in `internal/types/types.go:530` | `message` is a built-in type (GH#1347); `bd mail` delegates sending/reading to an external provider via `BEADS_MAIL_DELEGATE` / `mail.delegate`. |
| Nudge | no | — | No `bd nudge`. The nudge concept lives in orchestrator code. |
| Memory (`bd remember`) | yes | `cmd/bd/memory.go` | Stored as config rows keyed `kv.memory.<slug>`, NOT as issues. |
| Event (`type=event`) | yes (internal) | `internal/types/types.go:537-541` | `TypeEvent` is a system-internal issue type with `EventKind` / `Actor` / `Target` / `Payload` fields for audit trail. |
| Hook (bead lifecycle) | yes | `internal/hooks/` | Fire-and-forget scripts in `.beads/hooks/{on_create,on_update,on_close}`. |
| Hook (git) | yes | `cmd/bd/hooks.go` | `bd hooks install` writes `pre-commit` / `post-merge` / `pre-push` / `post-checkout` / `prepare-commit-msg` into `.git/hooks/`. |
| Tracker | yes | `internal/tracker/` + `internal/{ado,github,gitlab,jira,linear,notion}/` | `IssueTracker` + `FieldMapper` interfaces; 6 backends. |
| Gate | yes (custom type + fields) | `cmd/bd/gate.go`; `AwaitType` / `AwaitID` / `Timeout` / `Waiters` on `Issue` | `gate` is NOT a core `IssueType` constant. CLI string-matches `issue_type == "gate"`. |
| Epic / parent-child | yes | `IssueType("epic")` + `DepParentChild` | Epic progress fields computed at read time; `parent-child` is a blocking dependency type. |
| Defer | yes | `cmd/bd/defer.go` | Status-based (`StatusDeferred`) with optional `defer_until` timestamp. |
| Supersede | yes | `DepSupersedes` | Dependency type; no dedicated CLI (use `bd dep add … --type supersedes`). |
| Convoy | partial | `FormulaType = "convoy"` only | Formula type and `DepTracks` non-blocking dep; no `bd convoy` subcommand, no convoy runtime. |
| Order | no | — | No `bd order` and no order concept in beads. |
| Routing | yes (but narrow) | `internal/routing/` | Role-based *issue-creation* targeting (maintainer vs contributor). NOT the `gc.routed_to` metadata gascity uses for agent-pool dispatch. |
| Validation | yes | `internal/validation/`, `cmd/bd/lint.go`, `doctor.go`, `preflight.go`, `stale.go`, `orphans.go` | Multiple layers; `bd preflight` is dogfood-specific (Go tests / gofmt / etc.), not generic. |

The rest of this doc walks each concept and its code with citations.

---

## Formulas

### What a formula is

A formula is a workflow template stored as a file, parsed into a Go struct, and
"cooked" into proto beads for later instantiation. The package-level doc
comment summarises it directly:

> Formulas are high-level workflow templates that compile down to proto beads.
> They support variable definitions with defaults and validation, step
> definitions that become issue hierarchies, composition rules for bonding
> formulas together, and inheritance via `extends`.
> (`internal/formula/types.go:3-9`)

Formulas are NOT themselves beads. They are files on disk that get compiled
into beads at cook time.

### File formats and extensions

Two extensions are supported, with TOML preferred:

```go
const (
    FormulaExtTOML = ".formula.toml"
    FormulaExtJSON = ".formula.json"
    FormulaExt     = FormulaExtJSON // Legacy alias for backwards compatibility
)
```
(`internal/formula/parser.go:16-20`)

### Search paths (where formulas live)

`formula.DefaultSearchPaths()` at `internal/formula/parser.go:64-97` resolves
in this order (first match wins):

1. **Project**: `<resolved-beads-dir>/formulas/` (or `./.beads/formulas/` if
   no project is resolved).
2. **User**: `~/.beads/formulas/`.
3. **Orchestrator**: `$GT_ROOT/.beads/formulas/` (only if `GT_ROOT` is set).

`cmd/bd/formula.go:32-35` documents the same order in user help text. The
`bd formula list` command at `cmd/bd/formula.go:43-60` lists across all
three, with earlier paths shadowing later ones.

### Formula types

Four `FormulaType` values, defined at `internal/formula/types.go:35-62`:

- **`workflow`** — standard sequence of steps. The common case.
- **`expansion`** — a macro template for inline substitution; the formula's
  `template:` steps replace a target step during cook.
- **`aspect`** — cross-cutting concern applied via advice rules
  (`before` / `after` / `around`).
- **`convoy`** — a multi-agent workflow that coordinates parallel workers.
  Named in the type enum but has no dedicated runtime here — see
  [Convoys](#convoys) below.

### Formula schema (root struct)

`Formula` at `internal/formula/types.go:64-120` has these fields:

- `formula` (name, convention `mol-<name>` or `exp-<name>`).
- `description`, `version` (≥1), `type`.
- `extends` — list of parent formulas whose vars / steps / compose rules this
  formula inherits (child overrides by ID).
- `vars` — map of `VarDef` (defaults, `required`, `enum`, `pattern`, `type`).
- `steps` — `[]*Step` — the actual issues to create.
- `template` — alternate steps for `expansion`-type formulas.
- `compose` — `ComposeRules` (bond points, hooks, expand, map, branch, gate,
  aspects).
- `advice` — `[]*AdviceRule` (before / after / around) used by aspect formulas.
- `pointcuts` — target patterns for aspect application.
- `phase` — `"liquid"` or `"vapor"`, recommending `pour` vs `wisp`.
- `pour` — if true, each step becomes a persistent child issue; if false
  (default), only the root is created and steps are read inline at prime time.

### Step schema

`Step` at `internal/formula/types.go:190-269` — each step becomes one issue
during cook. Notable fields:

- `id`, `title`, `description`, `notes`.
- `type` — `task` / `bug` / `feature` / `epic` / `chore`. `cook.go:19-34` maps
  unknown types to `task`.
- `priority` (0-4; validated at `types.go:585-587`), `labels`, `assignee`.
- `depends_on` / `needs` — sibling step IDs (merged at cook time;
  `types.go:215-219`).
- `waits_for` — `"all-children"` / `"any-children"` / `"children-of(step-id)"`
  — fanout gate; adds `gate:<value>` label (`types.go:221-224`).
- `expand` + `expand_vars` — inline another expansion formula here.
- `condition` — skip this step unless `{{var}}` is truthy / equal
  (`types.go:238-241`). Evaluated by `FilterStepsByCondition`.
- `children` — nested steps (epic hierarchies).
- `gate` — async wait condition (see [Gates](#gates)).
- `loop` — `LoopSpec` (count / until / range + body).
- `on_complete` — `OnCompleteSpec` with `for_each` / `bond` / `vars` for
  runtime expansion over step output (`types.go:317-355`).
- `source_formula`, `source_location` — set during parse/transform, copied
  into the cooked issue so provenance is traceable.

### Composition primitives

`ComposeRules` at `internal/formula/types.go:386-414` defines how formulas
plug into each other:

- `bond_points` — named attachment sites. A bond point has `id`,
  `after_step` / `before_step` (mutually exclusive), and a `parallel` flag
  (`types.go:442-459`).
- `hooks` (formula-side hooks, unrelated to `.beads/hooks/`) — trigger a
  formula attach based on a `label:`, `type:`, or `priority:` condition
  (`types.go:461-475`).
- `expand` — apply an expansion to a specific step.
- `map` — apply an expansion to all steps matching a glob.
- `branch` — fork-join: one `from` step, parallel `steps`, rejoin at `join`
  (`types.go:358-372`).
- `gate` — `GateRule` — add a condition to be satisfied before a step
  (`types.go:373-384`). Distinct from the per-step `gate:` field.
- `aspects` — list of aspect formula names to apply to this formula.

### Variables

`VarDef` at `internal/formula/types.go:122-143` supports defaults, enum
constraints, regex patterns, and a type hint. `UnmarshalTOML`
(`types.go:154-188`) lets vars be written as either bare strings (shorthand
for `Default`) or full tables.

Required vars have no default. `Formula.GetRequiredVars`
(`types.go:800-808`) extracts them. Cook / pour error out if a required var
isn't supplied — `pour.go:181-191` prints a `--var <name>=...` hint.

### Cooking

`bd cook` (`cmd/bd/cook.go:37-89`) compiles a `.formula.{toml,json}` file
into a resolved representation. Two modes:

- **compile-time** (`--mode=compile`, default): produces a template with
  `{{variable}}` placeholders intact. Useful for modelling / estimation /
  contractor handoff.
- **runtime** (`--mode=runtime` or any `--var` flag): substitutes variables
  and errors if any required var is missing. Used as the internal step before
  `pour` / `wisp`.

By default, cook outputs JSON to stdout (ephemeral). `--persist` writes a
proto bead to the DB; `--force` replaces an existing one. Per `cook.go:63-67`:
"For most workflows, prefer ephemeral protos: pour and wisp commands accept
formula names directly and cook inline."

### Validation

`Formula.Validate` at `internal/formula/types.go:540-657` enforces:

- Name required, version ≥ 1, type must be valid.
- Var can't be both `required:true` AND `default`-set.
- Step IDs unique across the whole formula (nested too, via
  `collectChildIDs` at `types.go:661-685`).
- `title` required unless `expand` is used.
- Priority in `[0, 4]`.
- `depends_on` / `needs` references exist.
- `waits_for` value matches a known pattern and its target exists
  (`validateWaitsFor` at `types.go:726-745`).
- `on_complete.for_each` starts with `output.` and `parallel` / `sequential`
  are mutually exclusive (`validateOnComplete` at `types.go:777-797`).
- Bond points: can't have both `after_step` and `before_step`; each anchor
  step must exist.
- Hooks: `trigger` + `attach` both required.

---

## Molecules (protos, mols, wisps, compounds)

The molecule metaphor is documented tongue-in-cheek at `cmd/bd/mol.go:42-58`:

> The molecule metaphor:
> - A proto is an uninstantiated template (reusable work pattern)
> - Spawning creates a molecule (real issues) from the proto
> - Variables (`{{key}}`) are substituted during spawning
> - Bonding combines protos or molecules into compounds
> - Distilling extracts a proto from an ad-hoc epic

### Protos

A **proto** is an issue with `is_template: true` and the `MoleculeLabel`
(`cmd/bd/mol.go:27` — `MoleculeLabel = BeadsTemplateLabel`, the string
`"template"`). It is read-only and excluded from `bd list` by default.

Templates live in `.beads/molecules.jsonl`, NOT `.beads/issues.jsonl`.
`internal/molecules/molecules.go:1-21` describes the separation:

> Template molecules are read-only issue templates that can be instantiated as
> work items. They live in a separate molecules.jsonl file, distinct from work
> items in issues.jsonl.

### Loader — hierarchical precedence

`Loader.LoadAll` at `internal/molecules/molecules.go:61-122` reads
`molecules.jsonl` from four locations, later ones overriding earlier:

1. Built-in (embedded in the binary — currently empty; `getBuiltinMolecules`
   at `molecules.go:243-252` returns `nil` with a TODO comment).
2. Town: `$GT_ROOT/.beads/molecules.jsonl` (if `GT_ROOT` is set).
3. User: `~/.beads/molecules.jsonl`.
4. Project: `<beadsDir>/molecules.jsonl`.

Molecules that already exist are skipped (`loadMolecules` at `:127-159`);
there is no in-place update. Each loaded issue is force-marked
`IsTemplate = true`.

### Molecule type (`MolType`)

`internal/types/types.go:645-662` defines three values:

- `swarm` — coordinated multi-worker work.
- `patrol` — recurring operational work.
- `work` (default if empty) — regular assigned work.

### Pour — persistent instantiation ("liquid")

`bd mol pour <proto-id>` at `cmd/bd/pour.go` converts a proto into a set of
real (persistent) issues. Flow (`pour.go:51-255`):

1. Parse `--var key=value` flags.
2. Try to resolve the argument as a formula name first
   (`resolveAndCookFormulaWithVars`, `pour.go:86`). If that succeeds the
   proto is **ephemeral** — cooked inline, never written to the DB as a
   template (gt-4v1eo).
3. If it isn't a formula name, fall back to looking it up as an existing
   proto bead in the DB.
4. If the formula's `phase` is `"vapor"`, warn and point to `bd mol wisp`.
5. Resolve `--attach` protos; verify each carries the template label.
6. Apply variable defaults (`applyVariableDefaults`); error if any required
   var is missing (`extractRequiredVariables`).
7. `spawnMolecule(..., ephemeral=false, prefix=IDPrefixMol)` — the cloned
   issues get the `mol` prefix (e.g. `bd-mol-abc`), distinguishing them
   visually from wisps.
8. For each attachment, `bondProtoMol` wires it onto the root.

The issued IDs pick up the `IDPrefixMol` constant
(`internal/types/types.go:1407` — `"mol"`).

### Wisp — ephemeral instantiation ("vapor")

`bd mol wisp <proto-id>` (`cmd/bd/wisp.go:27-70`) creates the same graph but
with `Ephemeral=true` on each issue. Wisps are stored locally but NOT synced
via git. Wisp lifecycle per `wisp.go:53-58`:

1. Create: `bd mol wisp <proto>` or `bd create --ephemeral`.
2. Execute normally.
3. Squash (`bd mol squash <id>`) — clears `Ephemeral`, promoting to
   persistent AND producing a digest.
4. Or burn (`bd mol burn <id>`) — delete without a digest.

Wisps use the `IDPrefixWisp` constant (`"wisp"`, `types/types.go:1408`) so
IDs look like `bd-wisp-abc`.

Per-wisp TTLs for compaction are the `WispType` enum at
`internal/types/types.go:664-691`:

| `WispType` | Category | TTL |
|---|---|---|
| `heartbeat` | high-churn, low forensic value | 6h |
| `ping` | same | 6h |
| `patrol` | operational state | 24h |
| `gc_report` | same | 24h |
| `recovery` | significant events | 7d |
| `error` | same | 7d |
| `escalation` | same | 7d |

(see `WISP-COMPACTION-POLICY.md` referenced in the comment block).

### Bonding

`bd mol bond <A> <B>` is polymorphic (`cmd/bd/mol_bond.go:17-69`): `A` and
`B` can each be a proto, a formula name, or a mol. Bond type flags
(`types/types.go:1395-1401`):

- `sequential` (default) — B runs after A.
- `parallel` — B runs alongside A.
- `conditional` — B runs only if A fails.
- `root` — marks the primary / root component of a compound.

Compounds carry their provenance in `Issue.BondedFrom []BondRef` (each ref
stores `SourceID`, `BondType`, `BondPoint`). `Issue.IsCompound` /
`GetConstituents` (`types.go:1411-1420`) expose this at read time. Bond data
is part of the content hash (`types.go:143-148`).

### Distill and burn and squash

- **Distill** (`cmd/bd/mol_distill.go`): extract a reusable proto from an
  ad-hoc epic.
- **Squash** (`cmd/bd/mol_squash.go`): collapse a molecule (persistent or
  wisp) to a compact digest.
- **Burn** (`cmd/bd/mol_burn.go`): delete a wisp without a digest.

### `bd mol current` / `bd mol progress` — step position

Used by pool workers to track position in a running molecule
(`cmd/bd/mol_current.go`, `cmd/bd/mol_progress.go`). Workers read
`METADATA.molecule_id` on their work bead, then query `bd mol current
<molecule-id>` to see `[done]` / `[current]` / `[ready]` / `[blocked]` per
step. Not covered in more detail here — see doc 02.

---

## Recipes

Despite the overlapping name, **recipes are not a work concept.** They are
setup scaffolding for AI-tool integrations (where to write BEADS instructions
for Claude Code / Cursor / Windsurf / Gemini / Aider / Junie / etc.).

`internal/recipes/recipes.go:14-26` defines four install types:

- `file` — write template to a single path (`.cursor/rules/beads.mdc` etc.).
- `hooks` — merge SessionStart / PreCompact hooks into an IDE's JSON
  settings (used for `claude`, `gemini`).
- `section` — inject a marked section into an existing file (AGENTS.md, used
  by `factory`, `codex`, `mux`, `opencode`).
- `multifile` — write several related files (used by `aider`, `junie`).

Built-in recipe names at `recipes.go:42-117`: `cursor`, `windsurf`, `cody`,
`kilocode`, `claude`, `gemini`, `factory`, `codex`, `mux`, `opencode`,
`aider`, `junie`.

Users can add or override via `.beads/recipes.toml` (`LoadUserRecipes` at
`recipes.go:125-152`; `SaveUserRecipe` at `:195-238`). User recipes take
precedence over built-ins via `GetAllRecipes` (`:156-174`).

Nothing here creates, lists, or mutates issues. It only decides *where* to
write workflow instruction files during setup.

---

## Messages and mail

### `message` is a built-in issue type

`internal/types/types.go:530` declares `TypeMessage IssueType = "message"`.
The comment block at `:543-547` explains the history:

> Note: Orchestrator types (molecule, gate, convoy, merge-request, slot,
> agent, role, rig) were removed from beads core. They are now purely
> custom types with no built-in constants. Use string literals like
> `types.IssueType("molecule")` if needed, and configure `types.custom`.
> (event was also an orchestrator type but was promoted to a built-in
> internal type above.)
> (message was re-promoted to built-in for inter-agent communication —
> GH#1347.)

`TypeMessage` is included in `IssueType.IsValid()` (`:552-559`).

### Messaging fields on `Issue`

`internal/types/types.go:77-81` lists the messaging-specific fields:

- `Sender` — who sent this (for messages).
- `Ephemeral` — if true, not synced via git.
- `NoHistory` — stored in wisps table but not GC-eligible.
- `WispType` — classification for TTL-based compaction.

Threading note at `:82-83`: `RepliesTo` / `RelatesTo` / `DuplicateOf` /
`SupersededBy` moved to the dependencies table per Decision 004 (Edge
Schema Consolidation). Threading is represented as
`DepRepliesTo = "replies-to"` dependencies with a `ThreadID` that identifies
the conversation root (`Dependency.ThreadID`, `:721-723`).

### `bd mail` delegates

`cmd/bd/mail.go:12-84` — the `bd mail` subtree does NOT implement mail
itself. It delegates to an external command found via (in order):

1. `BEADS_MAIL_DELEGATE` env var.
2. `BD_MAIL_DELEGATE` env var.
3. `mail.delegate` config key (e.g. `bd config set mail.delegate "gt mail"`).

If none is configured, `bd mail` prints setup instructions and exits 1
(`mail.go:50-57`). When a delegate is found, the command runs the delegate
with every arg passed through unmodified (`mail.go:60-82`). Flag parsing is
disabled (`DisableFlagParsing: true`, `:38`) so subcommand flags don't get
eaten by bd.

### Summary

The **type** (`message`), the **threading edges** (`replies-to`), the
**wisps / ephemerality** are all beads-core. The **transport** (who sends,
who reads, who notifies) is delegated to an orchestrator. This keeps the
beads repo small without forcing orchestrators to reinvent the message type.

---

## Nudges

There is no nudge concept in beads. No `bd nudge` command, no "nudge" symbol
in `internal/`, no mention of nudges in user-facing help. `internal/routing/`
covers role-based creation targeting only (next section).

`nudgequeue` and `gc session nudge` are gascity constructs — see doc 05.

---

## Memories

`bd remember`, `bd memories`, `bd recall`, `bd forget` at
`cmd/bd/memory.go:44-294` store free-text insights across sessions.

### Storage

Memories are NOT issues. They are **config rows**. From `memory.go:13`:

```go
const memoryPrefix = "memory."
```

The key pattern is `kvPrefix + memoryPrefix + <slug>` (`memory.go:80`). `kvPrefix`
is the standard KV namespace; so a memory ends up at
`kv.memory.<slug>` in the `config` table.

### Key generation

`slugify` at `memory.go:21-42` takes the first ~8 hyphen-separated words,
lowercases, caps at 60 chars. Users can override with `--key` (`:307`) —
useful for updating in place since the setter uses `store.SetConfig` which
upserts.

### Operations

- `bd remember "<text>"` — create-or-update. Emits `Remembered` / `Updated`
  based on whether the key existed (`memory.go:85-90`).
- `bd memories [search]` — list all or substring-search keys and values
  (`memory.go:111-192`).
- `bd recall <key>` — fetch a single value (`memory.go:251-294`).
- `bd forget <key>` — delete (`memory.go:194-249`).

Memories are committed to Dolt immediately (each operation calls
`store.CommitPending`). There is no "memory" issue type. `bd prime` injects
memories into context automatically (see [Hooks](#hooks) below — the `bd prime`
pathway is how memories flow into a session).

---

## Events

### Event is a system-internal issue type

`internal/types/types.go:537-541`:

> `TypeEvent` is a system-internal type used by set-state for audit trail
> beads. Originally an orchestrator type, promoted to built-in internal type.
> It is not a core work type (not in `IsValid`) but is accepted by
> `IsValidWithCustom` / `ValidateWithCustom` and treated as built-in for
> hydration trust (GH#1356).

`TypeEvent` is deliberately excluded from the plain `IsValid()` switch
(`:552-558`) but included in `IsBuiltIn()` (`:565-567`) so federation
treats it as trusted rather than as a user-defined custom type.

### Event fields on `Issue`

Four fields grouped at `internal/types/types.go:108-112`:

- `EventKind` — namespaced event type (e.g. `patrol.muted`, `agent.started`).
- `Actor` — URI of whoever caused the event.
- `Target` — URI or bead ID affected.
- `Payload` — event-specific JSON.

All four are included in the content hash (`types.go:164-168`).

### Who creates them

Events are primarily created by orchestrator operations (set-state
transitions, patrol / agent lifecycle). beads-core does NOT have a direct
`bd event create` CLI — events enter via the normal issue-create path with
`issue_type=event` set. Consumers are orchestrator patrols and audit tooling.
Beyond the type and fields, there is no event engine here.

---

## Hooks

Beads has two distinct hook systems. Both are beads-core.

### Bead-lifecycle hooks (`.beads/hooks/`)

`internal/hooks/` runs executable scripts when issues change. `hooks.go:14-25`
defines three events and three filenames:

```go
const (
    EventCreate = "create"
    EventUpdate = "update"
    EventClose  = "close"
)

const (
    HookOnCreate = "on_create"
    HookOnUpdate = "on_update"
    HookOnClose  = "on_close"
)
```

`NewRunnerFromWorkspace` (`hooks.go:42-45`) resolves to
`<workspaceRoot>/.beads/hooks/`. `Run` (`:49-72`) is fire-and-forget:

- Returns immediately after spawning a goroutine.
- Skips silently if the hook file doesn't exist, isn't executable, or is a
  directory (`:57-66`).
- Failures are swallowed — hook output is not supposed to block the triggering
  operation.

`RunSync` (`:76-95`) is available for tests. Output captured by the runner is
truncated to `maxOutputBytes = 1024` (`:115-123`) before landing in OTel
span attributes.

### Git hooks (`cmd/bd/hooks.go`)

`bd hooks install` manages five git hooks:

```go
var managedHookNames = []string{
    "pre-commit", "post-merge", "pre-push", "post-checkout", "prepare-commit-msg",
}
```
(`cmd/bd/hooks.go:22`)

Each git hook gets a marked section — `# --- BEGIN BEADS INTEGRATION vX.Y ---`
through `# --- END BEADS INTEGRATION vX.Y ---` (`cmd/bd/hooks.go:33-43`). Only
content between the markers is managed; user content outside is preserved
(`injectHookSection` at `:95-151`).

The injected section runs `bd hooks run <hook> "$@"`:

```bash
if command -v bd >/dev/null 2>&1; then
  export BD_GIT_HOOK=1
  _bd_timeout=${BEADS_HOOK_TIMEOUT:-300}
  if command -v timeout >/dev/null 2>&1; then
    timeout "$_bd_timeout" bd hooks run <hook> "$@"
    …
  fi
  if [ $_bd_exit -eq 3 ]; then
    echo >&2 "beads: database not initialized — skipping hook '<hook>'"
    _bd_exit=0
  fi
  …
fi
```
(reconstructed from `cmd/bd/hooks.go:64-88`)

Defaults and resilience:

- Timeout defaults to 300s (configurable via `BEADS_HOOK_TIMEOUT`,
  `hooks.go:46-53`). On timeout the hook emits a warning and returns 0 so git
  operations are not blocked (GH#2453).
- Exit code 3 (database not initialized) is swallowed with a warning so a
  fresh clone doesn't block `git commit` (GH#2449).

### `bd prime`

`bd prime` (`cmd/bd/prime.go:46-127`) emits AI-optimized workflow context for
session hooks. It's wired into Claude Code / Gemini CLI via the
recipe-installed hooks. Priority cascade:

1. `.beads/PRIME.md` in the local clone (clone-specific override).
2. `.beads/PRIME.md` in the resolved workspace (shared override).
3. `~/.config/beads/PRIME.md` (`resolveGlobalPrimePath`, `prime.go:28-44`).
4. Default output (MCP-aware — brief in MCP mode, verbose otherwise;
   `prime.go:77-88` + `outputPrimeContext`).

Silent-fail-on-error is a deliberate design choice (`prime.go:121-125`):
"No stderr output, exit 0. This enables cross-platform hook integration." If
prime fails, it MUST NOT break session startup.

Memories (above) flow through here — prime reads them and injects them so
agents have context without manual loading.

---

## Trackers

Beads has a first-class abstraction for bidirectional sync with external
issue trackers.

### The plugin interface

`internal/tracker/tracker.go:13-59` defines `IssueTracker`. Every backend
implements:

- `Name()`, `DisplayName()`, `ConfigPrefix()` — identity.
- `Init(ctx, store)` — read configuration, authenticate.
- `Validate()` — verify config + connectivity.
- `Close()`.
- `FetchIssues(ctx, opts)`, `FetchIssue(ctx, identifier)` — pull side.
- `CreateIssue(ctx, issue)`, `UpdateIssue(ctx, externalID, issue)` — push side.
- `FieldMapper()` — returns the per-tracker field mapper.
- `IsExternalRef(ref)`, `ExtractIdentifier(ref)`, `BuildExternalRef(issue)`
  — convention-managing the opaque-string that beads stores in
  `Issue.ExternalRef`.

Two optional capabilities trackers may additionally implement:

- `BatchPushTracker` — `BatchPush(ctx, issues, forceIDs)` for multi-issue
  export in a single remote call (`tracker.go:62-65`).
- `BatchPushDryRunner` — preview decisions without mutating the remote
  (`tracker.go:68-71`).
- `PullStatsProvider` — report raw fetch vs. candidate counts after an
  incremental pull (`tracker.go:74-77`).

### The field mapper

`FieldMapper` at `tracker.go:81-107` handles bidirectional field conversion:

- `PriorityToBeads` / `PriorityToTracker` (0-4 in beads, arbitrary in
  remote).
- `StatusToBeads` / `StatusToTracker` (`Status` enum vs. remote-specific
  state).
- `TypeToBeads` / `TypeToTracker`.
- `IssueToBeads(trackerIssue) *IssueConversion` — full convert including
  any dependencies to create.
- `IssueToTracker(issue) map[string]interface{}` — build update fields.

### Backends

Six backends ship in-tree, each under `internal/<name>/`:

- `ado/` — Azure DevOps.
- `github/` — GitHub Issues (distinct from the Git remote).
- `gitlab/` — GitLab Issues.
- `jira/`.
- `linear/`.
- `notion/`.

### `external_ref`

The string stored in `Issue.ExternalRef` (`types.go:52`) is tracker-specific.
`IsExternalRef(ref)` on each tracker decides which backend owns a given
ref. Conventionally `gh-9`, `jira-ABC`, etc. — `BuildExternalRef` on the
backend defines the exact shape.

`Issue.SourceSystem` (`types.go:53`) records which adapter created the
issue; used by federation for hydration trust.

---

## Gates

Gates are **async wait conditions** that block downstream work until a
condition resolves. They show up in two places that share the same underlying
fields but are created differently.

### Gate-typed issues

The `gate` type is NOT a built-in Go constant. Per the comment at
`internal/types/types.go:543-545`, `gate` was pushed out of the core type
set and is now purely a custom type — users opt in via
`bd config set types.custom "gate,…"`.

The CLI sidesteps the type-registration issue by string-matching:
`cmd/bd/gate.go:188` checks `issue.IssueType != "gate"`. `bd gate list` filters
with `types.IssueType("gate")` (`:57`).

### Gate fields on `Issue`

`internal/types/types.go:92-96` defines the shape:

- `AwaitType` — the condition type: `gh:run`, `gh:pr`, `timer`, `human`,
  `mail` (per `cmd/bd/gate.go:28-34`), plus `bead` for cross-rig gates
  (`cmd/bd/gate.go:33`).
- `AwaitID` — condition identifier (workflow name / PR number / run ID / step
  ID).
- `Timeout` — max wait before escalation.
- `Waiters []string` — addresses to notify when gate clears.

All four are part of the content hash (`types.go:150-156`).

### Formula-step gates

In a formula, each `step` can carry a `Gate`:

```go
type Gate struct {
    Type    string
    ID      string
    Timeout string
}
```
(`internal/formula/types.go:271-283`)

When `bd cook` sees a step with `gate:`, it creates a gate issue that blocks
the step. Closing the gate unblocks the step. The compose-level
`GateRule` (`types.go:373-384`) is separate — it adds a runtime condition
that the patrol executor evaluates (not an issue).

### CLI: evaluation and resolution

`bd gate list [--all]` — lists open gates (closed too with `--all`)
(`cmd/bd/gate.go:46-83`). Output prefixes the blocked-step id derived from
`ID` — IDs have the form `<parent>.gate-<stepid>` (`gate.go:146-152`).

`bd gate check [--type=...]` (`gate.go:327-505`) walks open gates and
auto-closes the satisfied ones:

| Gate type | How it's checked | Resolved when | Escalated when |
|---|---|---|---|
| `gh:run` | `gh run view <id> --json status,conclusion,name` | `status=completed` AND `conclusion=success` (or `skipped`) | `conclusion` in (`failure`, `canceled`) |
| `gh:pr` | `gh pr view <id> --json state,merged,title` | `state=MERGED` | `state=CLOSED` AND not merged |
| `timer` | current time vs `CreatedAt + Timeout` | expired | — (timers never escalate; `gate.go:710-724`) |
| `bead` | cross-rig lookup | closed | — |
| `human` | skipped (manual `bd close`) | — | — |

**Observation**: `checkBeadGate` at `gate.go:732-734` always returns false
with "cross-rig bead gate cannot be checked (multi-rig routing removed)".
The `bead` gate type is documented but non-functional in current beads.

For `gh:run`, if `AwaitID` isn't numeric, beads treats it as a workflow name
hint and queries `gh run list --workflow` (`queryGitHubRunsForWorkflow` at
`:547-574`) to discover the latest run ID, then writes that ID back into the
gate via `updateGateAwaitID` (`:610-614`).

`bd gate resolve <id>` — manually close a gate (`gate.go:280-325`).
`bd gate add-waiter <gate-id> <waiter>` (`:162-220`) — register an agent for
wake-on-close notification. `bd gate show <id>` (`:223-277`).

`--escalate` on `bd gate check` triggers `escalateGate`
(`gate.go:751-766`), which shells out to `gt escalate` — i.e. escalation is
delegated to the orchestrator.

### Don't confuse gates with the `human` label

`cmd/bd/human.go:91-148` has a separate notion: `bd human list` shows issues
that carry the `human` label (plain string label, not a gate). This is for
surfacing issues that need a human decision outside the gate system.
`bd human respond` / `bd human dismiss` interact via comments. A gate with
`AwaitType=human` and a label `human` are different things; a gate happens
to also be an issue and can, separately, have the `human` label applied.

---

## Epic / parent-child

### The type

`TypeEpic` is in `IsValid()` — core built-in (`types.go:527`, `:554`).
Required section for an epic is `## Success Criteria` (`types.go:624-627`).

### The dependency

`DepParentChild` (`types.go:771`) is one of the **blocking** dependency types
— `AffectsReadyWork` returns true for it (`:825-827`). So a parent with
open children is treated as having blockers, same as a `blocks` dep.

### Rollup

`IssueDetails` carries epic progress that's computed at read time
(`types.go:758-761`):

- `EpicTotalChildren`
- `EpicClosedChildren`
- `EpicCloseable` — true when all children are closed.

Epic rollup is a read-time computation only; there's no dedicated epic
table and no trigger that auto-closes the parent when children close.

### Computed parent

`IssueWithCounts.Parent` and `IssueDetails.Parent` are computed from any
parent-child dep that terminates on this issue (`types.go:745`, `:756`;
comment marker `bd-ym8c`).

---

## Defer and supersede

### Defer

`StatusDeferred` is a status value (`types.go:330`), in the same column as
`open`, `closed`, etc. It classifies into `CategoryFrozen` alongside
`StatusPinned` (`types.go:511`).

`bd defer [id...]` (`cmd/bd/defer.go:15-109`) sets the status and optionally
writes `defer_until`:

```go
updates := map[string]interface{}{
    "status": string(types.StatusDeferred),
}
if deferUntil != nil {
    updates["defer_until"] = *deferUntil
}
```
(`defer.go:75-81`)

`--until` supports relative times (`+1h`, `tomorrow`, `next monday`,
`2025-01-15`) via `timeparsing.ParseRelativeTime` (`defer.go:38-49`). If the
parsed time is in the past the CLI warns, since the deferred issue will
appear in `bd ready` immediately.

`bd ready` excludes deferred issues by default; `bd ready
--include-deferred` shows issues whose `defer_until` has passed.

`bd undefer [id...]` (referenced at `cmd/bd/undefer.go`, same layout) clears
status back to `open` and unsets `defer_until`.

### Supersede

Supersede is a **dependency type** (`DepSupersedes`, `types.go:783`), not a
status. The convention is "X supersedes Y" recorded as an edge; both beads
remain in their original statuses.

There is no dedicated `bd supersede` command in beads (contrast with
gastown / gascity). Users wire supersede explicitly:

```bash
bd dep add <old-id> <new-id> --type supersedes
```

Dependency-type metadata can also carry JSON (`Dependency.Metadata`,
`types.go:720`) for supersede-specific details.

---

## Convoys

Convoy is a **formula type**, not an engine. From
`internal/formula/types.go:50-52`:

```go
// TypeConvoy is a multi-agent workflow that coordinates parallel workers.
// Examples: code review with multiple reviewers, design review sessions.
TypeConvoy FormulaType = "convoy"
```

`IsValid()` accepts it alongside workflow / expansion / aspect
(`types.go:56-62`). `bd formula list --type convoy` (`cmd/bd/formula.go:58`)
filters to convoy formulas.

### The non-blocking convoy dep

`DepTracks = "tracks"` at `types.go:792` is the "convoy → issue tracking
(non-blocking)" edge. `AffectsReadyWork` is false for it (`:825-827`), so
tracked issues don't block the convoy. The convoy can move forward while
still knowing about the work items it's tracking.

### There is no `bd convoy`

`cmd/bd/` has no convoy-specific command file. The execution model —
spawning parallel workers, coordinating their progress — is
orchestrator-level. See doc 05 for how gascity layers on top.

---

## Orders

Orders do not exist in beads. There is no `bd order` command, no `order`
issue type in `types.go`, and no `internal/order/` package. This is
orchestrator-only (gascity). The absence is worth noting because gascity's
`gc order` CLI can make it look like a shared concept.

---

## Routing

`internal/routing/` implements exactly one thing: **role-based issue-creation
targeting**.

### User role

`UserRole = "maintainer" | "contributor"` (`routing.go:21-26`).

`DetectUserRole(repoPath)` at `routing.go:35-55`:

1. Prefer `git config beads.role` (GH#2950) — if it's `maintainer` or
   `contributor`, use that.
2. Fall back to the deprecated URL heuristic, emitting this warning (seen
   on every `bd ready` / `bd update` in this session, incidentally):

   ```
   warning: beads.role not configured (GH#2950).
     Fix: git config beads.role maintainer
     Or:  git config beads.role contributor
   ```

3. URL heuristic (`detectFromURL`, `:60-87`): if origin + upstream point
   to different repos, assume contributor (fork workflow); if origin URL is
   SSH or contains `@`, assume maintainer (write access); otherwise
   contributor.

### Target repo

`DetermineTargetRepo(config, role, repoPath)` at `routing.go:152-175`:

1. Explicit `--repo` override always wins.
2. `auto` mode routes by role (`MaintainerRepo` vs `ContributorRepo`).
3. Fall back to `DefaultRepo`, else current repo.

### What this isn't

This is NOT the `gc.routed_to` metadata gascity uses to dispatch work to a
worker pool. Worker-pool routing is orchestrator-level; beads-core routing
is only about *which repo* to create a new issue in.

---

## Validation

Validation is layered. The central helpers live in `internal/validation/`;
the user-facing commands are multiple.

### `internal/validation/`

- `bead.go` — `ParsePriority`, `ValidatePriority` (0-4 or `P0-P4`),
  `ParseIssueType` (via `IssueType.Normalize()`), `ValidateIDFormat` (must
  contain a hyphen; hyphenated prefixes handled by
  `utils.ExtractIssuePrefix`, `bead.go:59-76`), and the prefix-match policy
  (`validatePrefixWithAllowed`, `:80-100`).
- `issue.go` — Issue-level validation.
- `template.go` — Template/molecule validation.

### `bd lint`

`cmd/bd/lint.go:22-100` — check issues for missing recommended sections
based on issue type. Section requirements live in
`IssueType.RequiredSections()` at `types.go:611-643`:

| Type | Required sections |
|---|---|
| bug | Steps to Reproduce, Acceptance Criteria |
| task | Acceptance Criteria |
| feature | Acceptance Criteria |
| story | Acceptance Criteria |
| epic | Success Criteria |
| decision | Decision, Rationale, Alternatives Considered |
| spike | Goal, Findings |
| chore / milestone / custom | none |

Defaults: lints open issues only; `--status all` to include closed. Per-issue
or per-type filters are available. Output is a per-issue summary with a
`Missing` list.

### `bd doctor`

`cmd/bd/doctor.go:67-325` — a comprehensive installation-health probe. It is
not a bead-content validator; it checks the setup. Categories run at
`runDiagnostics` (`:345-833`) include:

- Core: `.beads/` exists, DB version / schema / fingerprint / integrity,
  ID format, permissions.
- Git: managed git hooks, stale `.legacy` hooks, Dolt compatibility,
  gitignore, working tree cleanliness, upstream sync.
- Data: JSONL pollution, config value validation, role config,
  multi-repo custom types, remote consistency.
- Integration: Claude hook completeness, plugin version, `bd prime` output
  health, `bd` in `PATH`, doc references.
- Federation: remotes-API port, peer connectivity, sync staleness, conflicts,
  server-mode mismatch.
- Metadata: dependency cycles, orphaned deps, child→parent deps (anti-pattern),
  duplicates, test pollution, stale closed issues, stale molecules, persistent
  `mol-` issues, stale merge-queue files, patrol pollution.
- Infrastructure: DB size, pending migrations, KV sync status, Dolt locks,
  classic artifacts, Linux btrfs NoCOW.

Modes: `--fix`, `--dry-run`, `--interactive`, `--verbose`, `--perf`
(performance diagnostics), `--output file.json` (export), `--check=<name>`
(focused — `artifacts` / `conventions` / `pollution` / `validate`),
`--deep` (full graph integrity), `--server` (Dolt server mode),
`--migration=pre|post`, `--agent` (agent-facing ZFC-compliant output).

Warnings can be suppressed via `doctor.suppress.<slug>` config
(`doctor.go:151-157`) for users who've consciously accepted a finding.

### `bd preflight`

`cmd/bd/preflight.go:34-55` — **NOT** a generic lint. It is a checklist of
Go-specific pre-PR checks for the beads repo itself (dogfood): tests,
`golangci-lint`, `gofmt`, JSONL pollution, Nix hash freshness, version sync.

```
PR Readiness Checklist:

[ ] Tests pass: go test -tags gms_pure_go -short ./...
[ ] Lint passes: golangci-lint run --build-tags=gms_pure_go ./...
[ ] Formatting: gofmt -l .
[ ] No beads pollution: check .beads/issues.jsonl diff
[ ] Nix hash current: go.sum unchanged or vendorHash updated
[ ] Version sync: version.go matches default.nix
```
(`preflight.go:84-92`)

`--check` runs them automatically. This behaviour is specific to how the
beads project itself ships — orchestrators that reuse the name
(e.g. gascity, gastown) implement their own `preflight` semantics.

### `bd stale`

`cmd/bd/stale.go:12-79` — issues not updated within `--days` (default 30),
optionally filtered by status. Flagging candidate issues for abandonment or
forgotten work.

### `bd orphans`

`cmd/bd/orphans.go:29-100` — issues that are referenced in commit messages
but remain open or in-progress. Helps identify implemented-but-not-closed
work. Supports `--label` / `--label-any` filters and `--fix` to close
orphans with confirmation (runs `bd close <id> --reason Implemented`).

### Validation config keys

Per CLAUDE.md and `bd config set validation.on-create warn`, the
`validation.*` namespace governs whether `bd create` runs `--validate`
automatically. The exact key set is defined in config schema files; doc 02
is the source of truth for the CLI / config surface.

---

## Supporting enums

A pass through the type constants that show up across the doc.

### `Status` (`types.go:323-334`)

`open`, `in_progress`, `blocked`, `deferred`, `closed`, `pinned` (persistent,
stays open indefinitely), `hooked` (actively claimed by a worker).

Categories (`types.go:502-515`):
- `CategoryActive` = open.
- `CategoryWIP` = in_progress, blocked, hooked.
- `CategoryDone` = closed.
- `CategoryFrozen` = deferred, pinned.

### `IssueType` — core work types (`types.go:521-535`)

`bug`, `feature`, `task`, `epic`, `chore`, `decision`, `message`, `molecule`
(internal), `spike`, `story`, `milestone`. Plus internal-but-built-in:
`event`. Aliases: `enhancement` / `feat` → `feature`; `dec` / `adr` →
`decision`; `investigation` / `timebox` → `spike`; `user-story` / `user_story`
→ `story`; `ms` → `milestone` (`types.go:587-601`).

### Removed / custom types

Per `types.go:543-547`, these were removed from the core set and now
require `types.custom` registration: `gate`, `convoy`, `merge-request`,
`slot`, `agent`, `role`, `rig`. `event` and `message` were re-promoted to
built-in.

### `MolType` (`types.go:645-662`)

`swarm`, `patrol`, `work` (default when empty).

### `WispType` (`types.go:664-691`)

TTL-classified ephemerals: `heartbeat` / `ping` (6h); `patrol` / `gc_report`
(24h); `recovery` / `error` / `escalation` (7d).

### `WorkType` (Decision 006, `types.go:693-709`)

- `mutex` (default) — one worker, exclusive assignment.
- `open_competition` — many submit, buyer picks.

### `DependencyType` (`types.go:764-801`)

Twenty types, grouped:

- **Workflow (affect ready work)**: `blocks`, `parent-child`,
  `conditional-blocks`, `waits-for`.
- **Association**: `related`, `discovered-from`.
- **Graph links**: `replies-to`, `relates-to`, `duplicates`, `supersedes`.
- **Entity** (Decision 004 / HOP): `authored-by`, `assigned-to`,
  `approved-by`, `attests`.
- **Convoy tracking**: `tracks` (non-blocking).
- **Reference**: `until`, `caused-by`, `validates`.
- **Delegation**: `delegated-from`.

`AffectsReadyWork` is true only for the first group
(`types.go:823-827`). `IsWellKnown` catalogues the above; arbitrary strings
up to 50 chars are accepted by `IsValid` (`:806-821`).

### Bond types (`types.go:1395-1401`)

`sequential` (B after A), `parallel` (B alongside A), `conditional` (B if A
fails), `root` (primary component).

### ID prefixes (`types.go:1403-1409`)

`mol` for persistent molecules; `wisp` for ephemerals. Issue IDs end up as
`<project>-<prefix>-<id>` (e.g. `bd-mol-abc`, `bd-wisp-def`).

---

## Gaps and contradictions

Things that code and docs don't agree on, or where a concept is documented
but unimplemented:

### Built-in molecules are empty

`internal/molecules/molecules.go:243-252`:

```go
func getBuiltinMolecules() []*types.Issue {
    // For now, return an empty slice. Built-in molecules can be added later
    // using Go embed or by defining them inline here.
    //
    // Example built-in molecules:
    // - mol-feature: Standard feature workflow …
    return nil
}
```

README-level material talks about built-in molecules as a concept, but the
binary ships with zero of them. Every molecule comes from town / user /
project JSONL. A fresh install has no templates until someone provides them.

### Cross-rig `bead` gates cannot resolve

`cmd/bd/gate.go:726-734`:

```go
// Multi-rig routing has been removed, so cross-rig bead gates cannot be
// resolved. This always returns false with a descriptive message.
func checkBeadGate(_ context.Context, awaitID string) (bool, string) {
    return false, fmt.Sprintf("cross-rig bead gate %q cannot be checked (multi-rig routing removed)", awaitID)
}
```

`bd gate` help (`:28-36`) still documents `bead` as a gate type, and
`bd gate check --type=bead` is accepted by the filter. But no `bead` gate
will ever close via `bd gate check` — it can only be closed manually via
`bd close` / `bd gate resolve`. Doc / code mismatch.

### `gate` is a "custom type" but the CLI depends on it

`types.go:543-545` declares `gate` removed from core types. But `bd gate`
commands (`cmd/bd/gate.go:57`, `:188`, `:243`, `:304`) all string-match
`issue_type == "gate"`. A fresh project that hasn't added `gate` to
`types.custom` will create gate issues that fail `IsValidWithCustom`, and
`bd create -t gate` will error unless the user opts in. The expectation is
that orchestrators configure `types.custom` for their users.

### `bd preflight` name collision

`bd preflight` in beads is Go-project-specific (go test / golangci-lint /
gofmt / Nix / version sync). Gascity / gastown orchestrators describe
"preflight" generically (lint, stale, orphans). Same name, different things.
Anyone reading gascity's prime instructions (in the session context of this
workspace, for instance) and running `bd preflight` in this repo will see
Go-specific output. Clarify in UI / docs which `preflight` they mean.

### `--validate` validation ≠ `bd lint` validation

`bd lint` is post-hoc; `bd create --validate` is pre-creation. They share
the `RequiredSections()` table but have different call sites. Users expect
`--validate` to reject missing sections; it emits warnings on create
(governed by `validation.on-create`). The doc-01 data-model doc should
reconcile which is authoritative.

### Messaging: thread shape

Threading is documented as `DepRepliesTo` with a `ThreadID` grouping.
Nothing in beads-core creates those edges automatically; sending a reply is
orchestrator-delegated (`bd mail` is a pass-through). So the thread concept
exists in the schema but has no producer in beads itself. This means UI
code has to rely on orchestrator-side conventions — a beads-ui that assumes
`DepRepliesTo` is populated will be sparse on a beads-only install.

### `Phase: "vapor"` warning fires on `pour`, but not the inverse

`pour` warns when the formula sets `phase: "vapor"` (`pour.go:93-102`). The
`wisp` command does not symmetrically warn when the formula sets
`phase: "liquid"` — check `cmd/bd/wisp.go` — so a user pouring a vapor formula
is nudged back to `wisp`, but a user wisping a liquid formula is not nudged
toward `pour`. Minor asymmetry.

### Event vs wisp overlap

`TypeEvent` beads carry audit information. `WispType` beads (via
`Ephemeral=true`) also carry operational-state information and are also
auto-compacted. A patrol cycle could plausibly be either an event (audit
trail) or a wisp (ephemeral, TTL'd). The boundary isn't formally stated
anywhere in the code. Orchestrators choose; a UI surfacing "events" needs a
story for which of these to show.

### Recipes share a word with formulas but aren't related

"Recipe" is a setup-scaffolding concept (which files to write for Cursor /
Claude / etc.) and has nothing to do with workflows or cooking despite
cook / recipe / formula all being culinary-adjacent names. A UI that
surfaces "recipes" as work templates would be confusing. The recipe doc
comment (`internal/recipes/recipes.go:1-2`) is explicit: "Recipes define
where beads workflow instructions are written for different AI tools."

### "Nudge" appears in orchestrator help but not here

Operators coming from gascity will type `bd nudge` expecting it to work.
It doesn't — no such command. `bd --help` doesn't list nudge and `internal/`
has no nudge package. Route them to `gc session nudge` (gascity) or the
equivalent orchestrator-side command.

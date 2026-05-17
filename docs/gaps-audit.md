# Gaps & inconsistencies audit

Cross-reference pass over the five worker docs (`01-data-model.md`,
`02-cli-surface.md`, `03-concepts.md`, `04-gastown-integration.md`,
`05-gascity-integration.md`). Consolidates contradictions, naming drift,
vestigial code, and implementation divergences between the two
orchestrators. Feeds the Diátaxis handbook in `handbook/`.

Entries prefixed **[A]** are *cross-doc* — something one doc asserts that
another either contradicts or fails to acknowledge. Entries prefixed **[B]**
are *naming collisions* — same word, different referent. **[C]** are
*beads-internal code-vs-docs mismatches* (consolidated from each worker's
"Gaps" section). **[D]** are *orchestrator divergences* — two implementations
of the same concept that can't both be canonical. **[V]** are
*vestigial* — code or schema that no production path touches.

---

## A. Cross-doc contradictions and omissions

### A1. `hooked` status: "barely used" vs actively consumed

- `01-data-model.md:615` (§5.1) — *"'hooked' is defined as 'Work actively
  claimed by a worker' but no code transitions to/from it except a single
  `validation.NotHooked` guard."* Flagged as possibly unwired (§17.3).
- `04-gastown-integration.md:1291` (§8.2) — gastown's `BdCmd` example shows
  explicit `bd update --status=hooked` on dispatch.

**Reconciliation**: `hooked` is a contract for orchestrators, not for
beads internals. Doc 01's finding is true *within beads*, misleading
*in context*. The handbook's lifecycle reference should state: "`hooked`
is reserved for orchestrators to signal `an agent has claimed this work`;
beads itself never transitions to it."

### A2. Number of built-in `Status` values

- `01-data-model.md:598-608` — seven statuses: `open`, `in_progress`,
  `blocked`, `deferred`, `closed`, `pinned`, `hooked`.
- `05-gascity-integration.md:1655-1663` (§14.4) — claims bd has "a 6-status
  surface (open, in_progress, blocked, review, testing, closed)" and
  gascity collapses to 3.

Doc 05 is wrong about bd's built-ins. `review` and `testing` are not
built-in — they're common *custom statuses* that gascity's mapping
logic treats specifically. `deferred`, `pinned`, and `hooked` are
genuine built-ins that doc 05 drops. Worth flagging: gascity's
`bdstore.go:389-398` status mapping is the authoritative code for what
gascity actually sees, but the comment around it misattributes the bd
surface.

### A3. Threading: schema says "replies-to dep + ThreadID"; gascity uses labels

- `03-concepts.md:~400-410` — threading is stored as `DepRepliesTo`
  dependency with `ThreadID` field on the dep.
- `03-concepts.md:1195-1201` (§Gaps) — but no beads-core code *creates*
  these edges; `bd mail` is pure delegate, so the thread schema "has no
  producer in beads itself."
- `05-gascity-integration.md:1046-1068` (§8.1) — gascity's beadmail stores
  threads as `thread:<id>` labels and read-state as a `read` label.

Two threading mechanisms coexist:
- **Schema-supported** (via deps + ThreadID) — unused by either
  orchestrator.
- **Label-based** (gascity) — the de facto implementation.

The beads-ui has to decide: read threads from deps (empty set), from
labels (gascity), or both. Recommendation: surface both, and note that
a beads install using only the CLI (no orchestrator) produces
threadless mail.

### A4. `bd mail` is stateless delegate — no orchestrator uses the delegate hook

- `03-concepts.md:406-419` — `bd mail` dispatches to `BEADS_MAIL_DELEGATE`
  / `mail.delegate` config. Without a delegate set, `bd mail` exits 1 with
  setup instructions.
- `02-cli-surface.md:1481-1496` — same, "no implementation in bd".
- `04-gastown-integration.md:§7.3.1` — gastown's mail uses `NewMailboxBeads()`
  directly (no `bd mail`).
- `05-gascity-integration.md:§8.1` — gascity's beadmail bypasses `bd mail`
  and creates beads directly via `Store.Create`.

So `bd mail` is a delegate protocol that is shipped in beads but which
the two major orchestrators both skip. If a user types `bd mail send …`,
nothing happens unless they manually configure a delegate. Worth
documenting in tutorials as "how to add `bd mail` support: point it at
`gt mail` or write your own script."

### A5. `internal/recipes/` is not a work concept

- `03-concepts.md:346-369` — beads's `recipes` is about where to install
  AI-tool integrations (Cursor, Claude, Gemini, etc.). Not workflow
  templates.
- `05-gascity-integration.md:786-790` — gascity uses `Recipe` as the type
  name for compiled-formula output. Different meaning.
- `04-gastown-integration.md` — no mention.

Name collision is internal to beads vs gascity. External users probably
won't hit it. Ensure the handbook puts `bd`'s `recipes` into setup/init
docs, not work docs.

### A6. `bd ready` exclusion list is duplicated without test enforcement

- `02-cli-surface.md:982-984` — `bd ready` excludes
  `merge-request`, `gate`, `molecule`, `message`, `agent`, `role`, `rig`
  types by default.
- `05-gascity-integration.md:1676-1695` (§14.5) — gascity duplicates this
  list in its own Go map. Comment acknowledges it must match; no
  cross-repo test enforces it.

If beads adds an infra type, gascity's in-process stores (MemStore,
FileStore, used in tests) drift silently from BdStore. Worth an upstream
test.

### A7. Convoy: formula-type in beads vs full subsystems in orchestrators

- `03-concepts.md:859-886` — beads has a `FormulaType = "convoy"` and a
  `DepTracks = "tracks"` non-blocking dep. No `bd convoy` command, no
  runtime.
- `04-gastown-integration.md:§5.12, §7.2.1` — gastown's `internal/convoy/`
  has full CLI + operations.
- `05-gascity-integration.md:§6.1` — gascity's `internal/convoy/` also has
  full CLI + operations, with its own types.

Both orchestrators independently built convoy runtimes over the same
beads scaffold. Neither shares code. Doc 04 §11 confirms no
gastown↔gascity cross-imports.

### A8. `pour` / `cook` / `mol` surface across bd, gastown, gascity

- `03-concepts.md:255-292` + `02-cli-surface.md:§10.4–10.7` —
  beads provides `bd cook`, `bd pour`, `bd mol (current|progress|bond|…)`,
  `bd wisp`. Formula → proto → molecule/wisp.
- `04-gastown-integration.md:1619-1624` (§12.1 #3) — gastown uses
  `gt mol attach` for pour-like workflows; `gt mol pour` is NOT a
  gastown command. Operators coming from bd's terminology will be
  confused.
- `05-gascity-integration.md:§4–5, §14.3` — gascity does its own
  formula compile + `molecule.Cook` (via `GraphApplyPlan`). Does NOT
  call `bd mol cook` / `bd pour`. But relies on `bd mol current`
  for runtime step tracking.

So the pour pipeline exists in three layers:
- **beads** owns compilation and step tracking (`bd cook`, `bd mol current`).
- **gastown** owns dispatch and does its own attachment (`gt mol attach`).
- **gascity** owns compilation *and* attachment (via graph-v2 contract),
  but delegates step tracking to bd.

Doc 05 §14.3 flags the risk: "if `bd` ever grows a real first-class
formula engine, there will be two parsers for the TOML format. Keep an
eye on format drift." This is *already* true for gascity.

### A9. `bd preflight` is Go-project-specific

- `02-cli-surface.md:§9.4` — `bd preflight` runs Go tests, golangci-lint,
  gofmt, Nix hash check, version.go-vs-default.nix sync.
- `03-concepts.md:1011-1029` — flags this as a name collision with
  gastown/gascity usage of "preflight" as a generic lint term.

bd's `preflight` is dogfood for the beads repo itself; it will confuse
anyone else who runs it in an unrelated project. Recommendation: handbook
should scope `bd preflight` to beads maintainers only.

### A10. Events: three parallel logs, no single source

- `01-data-model.md:§3.4` + `§2.15` — beads has `events` TABLE
  (per-issue change history, auto-populated) *and* `type=event` BEADS
  (audit-trail beads with event_kind/actor/target/payload). The events
  table migration (0005) is in place but **no writer was found**
  (§17.7).
- `03-concepts.md:482-514` — `type=event` beads exist for
  orchestrator-emitted audit events.
- `05-gascity-integration.md:§11.1` — gascity maintains its OWN
  `.gc/events.jsonl` file, completely outside beads. Has a `Register`
  mechanism enforcing every known event type has a payload.

So if an operator asks "what happened in the system today?", the answer
depends on which log they look at:
- beads `events` table — empty (dead).
- beads `type=event` beads — populated if any orchestrator writes them;
  gascity does not.
- gascity `.gc/events.jsonl` — populated, but tied to gascity's runtime,
  not visible to bd clients.

If beads-ui wants to surface a unified event view, it has to decide: go
to the JSONL (gascity-aware, gastown-blind), or to `type=event` beads
(empty on a gascity install).

### A11. Mutation hook set

- `02-cli-surface.md:§5.5` — HookFiringStore fires `on_update` for
  `AddDependency`, `RemoveDependency`, `AddLabel`, `RemoveLabel`,
  `AddIssueComment`. **Does not fire hooks for `DeleteIssue`.**
- `03-concepts.md:517-552` — same three events (create/update/close), no
  mention that delete is excluded.
- `05-gascity-integration.md:§7` — gascity relies on hooks as the
  write-side event bus for cache invalidation. If an agent runs
  `bd delete`, the cache doesn't invalidate — it will drift until the
  next reconciler tick (30s–120s).

So `bd delete` is a silent-invalidation hazard for any gascity-backed
cache. The handbook reference should call it out.

---

## B. Naming collisions

### B1. "Molecule" — six meanings

| # | Meaning | Source |
|---|---|---|
| 1 | Template issue (`is_template=true`) in `molecules.jsonl` | `03-concepts.md:~222-247` |
| 2 | Issue with `type="molecule"` (custom type, removed from core in `types.go:543`) | `03-concepts.md:~378-388` |
| 3 | `bd mol`'s step workflow runner (`bd mol current/progress`) | `02-cli-surface.md:§10.6` |
| 4 | Gastown's DAG parsed from bead description (`internal/beads/molecule.go`) | `04-gastown-integration.md:1044-1057` |
| 5 | Gastown's runtime formula instance (with checkpoint) | `04-gastown-integration.md:1058-1069` |
| 6 | Gascity's `type="molecule"` bead, the root of an instantiated formula | `05-gascity-integration.md:§5.1` |

Beads-ui must pick one. Recommendation: favor meaning #6 (the root bead
with `type="molecule"`) as the user-facing "molecule," and use
"workflow" or "recipe" for meaning #1 (the template). Meanings #3 and
#6 together form a useful pair: one is the shape, the other is the
runner.

### B2. "Wisp" — three meanings

| # | Meaning | Source |
|---|---|---|
| 1 | Ephemeral bead (beads-core), lives in `wisps` table (dolt-ignored) | `01-data-model.md:§3.9` |
| 2 | Root bead with `type="wisp"` from a vapor-phase formula | `05-gascity-integration.md:§5.3` |
| 3 | Local-only KV config at `.beads-wisp/config/<rig>.json` in gastown | `04-gastown-integration.md:1246-1252` |

Meaning #3 is gastown overloading the name for something unrelated.
Handbook should stick to meaning #1 (the canonical storage concept)
and reference #2 as a gascity-specific convention layered on top.

### B3. "Recipe"

| # | Meaning | Source |
|---|---|---|
| 1 | AI-tool integration install target (`bd` setup) | `03-concepts.md:346-369` |
| 2 | Gascity's compiled-formula output | `05-gascity-integration.md:§4.3` |

Unrelated meanings. #1 is a beads user-facing concept; #2 is gascity
internal.

### B4. "Convoy"

| # | Meaning | Source |
|---|---|---|
| 1 | Formula type (`FormulaType="convoy"` in beads) — shape of workflow | `03-concepts.md:859-868` |
| 2 | `DepTracks = "tracks"` non-blocking dep in beads | `01-data-model.md:§6.1` |
| 3 | Gastown's `internal/convoy/` — work-tracking container + CLI | `04-gastown-integration.md:§5.12, §7.2.1` |
| 4 | Gascity's `internal/convoy/` — container bead with CLI | `05-gascity-integration.md:§6.1` |

#1 and #3/#4 conflate in user writing. Doc 04 §12.4 flags this:
"Two convoy subsystems. Convoy-the-bead-type and
convoy-the-formula-type share a name and overlap in domain." The
handbook should treat the formula-type as the static shape and the
bead-type as its runtime; using "convoy formula" vs "convoy bead" is
clearer.

### B5. "pinned"

| # | Meaning | Source |
|---|---|---|
| 1 | `Status = "pinned"` — status value; views skip pinned rows like closed | `01-data-model.md:§5.1` |
| 2 | `pinned` boolean column (separate from status) — "persistent context marker, not a work item" | `01-data-model.md:§2.12` |

Doc 01 §17.4 flags: "`bd update <id> --pinned true` might change the
column, not the status — these are different things." The handbook
reference should lead with status `pinned` and demote the column to
"advanced."

### B6. "hook"

| # | Meaning | Source |
|---|---|---|
| 1 | Mutation hook (`.beads/hooks/on_create` etc.) — fire-and-forget script | `02-cli-surface.md:§5.3` |
| 2 | Git hook (`.git/hooks/pre-commit` etc.) — via `bd hooks install` | `02-cli-surface.md:§5.1` |
| 3 | Gastown `hook_bead` field — "this agent's active work" | `04-gastown-integration.md:§4.4` |
| 4 | Gastown `internal/hooks/` — Claude Code / editor hook files | `04-gastown-integration.md:§7.5.1` |

Four distinct meanings, all live in the same orchestrated system.
Reference should keep them in separate sections.

### B7. "preflight"

| # | Meaning | Source |
|---|---|---|
| 1 | `bd preflight` — Go-specific pre-PR checklist for the beads repo | `02-cli-surface.md:§9.4` |
| 2 | Gastown / gascity "preflight" — generic lint (lint, stale, orphans) | `03-concepts.md:1178-1184` |

Recommendation: handbook reference notes bd's is dogfood; orchestrators
should rename theirs.

### B8. "nudge"

| # | Meaning | Source |
|---|---|---|
| 1 | Not a beads concept (no `bd nudge` command) | `03-concepts.md:431-437` |
| 2 | Gastown: live tmux send-keys delivery | `04-gastown-integration.md:§7.3.2` |
| 3 | Gascity: deferred-delivery queue + live prompt injection | `05-gascity-integration.md:§8.2, §8.3` |

The absence of bd-side nudge is important information. Handbook should
call out "`bd nudge` doesn't exist; use your orchestrator's equivalent."

---

## C. Beads-internal code-vs-docs mismatches

Flags each worker produced; consolidated, deduped, and sourced.

### C1. `AffectsReadyWork` vs the `ready_issues` view

- `01-data-model.md:§17.2` — Go code (`types.go:825-827`) says four dep
  types affect ready work. The live SQL view
  (`migrations/0025_update_ready_issues_view.up.sql:5-22`) enforces only
  `type='blocks'`. `parent-child` appears in the deferred-parent CTE
  only. `conditional-blocks` and `waits-for` aren't in the view at all.

Meaningful: a `waits-for` dep between two open beads does NOT show the
waiter as blocked in `bd ready`. Only `blocks` deps do. The handbook's
ready-semantics page should use the VIEW (the SQL) as canonical, not
the Go helper.

### C2. `event` type and the `IsValid()` asymmetry

- `01-data-model.md:§2.15, §10.1` — `TypeEvent` is NOT accepted by
  `IssueType.IsValid()` (strict check) but IS accepted by
  `IsValidWithCustom` / `IsBuiltIn`. This is deliberate: events are
  system-internal, not user-creatable via strict validation, yet
  federation hydrates them with builtin trust.

Not a bug, but surprising. Handbook reference should call out "`event`
is built-in for the system, opt-in for users."

### C3. `gate` type is custom-but-required

- `03-concepts.md:691-698` — `gate` is NOT a built-in. CLI string-matches
  `issue_type=="gate"`. Fresh projects need `bd config set types.custom
  "gate,…"` before `bd gate` works.

The `bd gate` family assumes the type is registered. No error message
points the user to this config step. Handbook should make it an
init-time checkbox.

### C4. `bd gate check` of `bead` type always fails

- `03-concepts.md:750-756` — `checkBeadGate` returns false with
  `"cross-rig bead gate cannot be checked (multi-rig routing removed)"`.
- `bd gate --help` still documents `bead` as a valid gate type.

Doc-to-code contradiction. `bead` gate type is de facto dead. Remove from
the handbook reference or flag explicitly.

### C5. Two `GenerateHashID` implementations

- `01-data-model.md:§17.5` — `internal/idgen/hash.go` (base36, production)
  and `internal/types/id_generator.go` (hex, unused, full SHA256).

Dead code in the hex variant. Not user-visible but worth noting for
any agent that greps.

### C6. Built-in molecules list is empty

- `03-concepts.md:1133-1145` — `getBuiltinMolecules()` returns `nil` with
  a TODO. A fresh install ships zero templates.

README-level material talking about "built-in molecules" sets false
expectations. Recommendation: handbook tutorials should explicitly say
"you'll need to populate `.beads/molecules.jsonl` yourself or rely on
your orchestrator's embedded templates."

### C7. `interactions` table has no writer

- `01-data-model.md:§17.7` — migration 0014 creates the
  `interactions` table. `audit.Append` writes to
  `interactions.jsonl` (file), not the table. No direct INSERTs into
  the table were found.

Likely an unfinished migration target. Not user-visible.

### C8. `metadata` (table) committed vs `local_metadata` (table) clone-local

- `01-data-model.md:§17.8` — the `metadata` table is committed to Dolt;
  `local_metadata` is dolt-ignored. Migration 0030 moved common local
  keys (`tip_*`, `bd_version*`, `*.last_sync`) out of `metadata` into
  `local_metadata`. Any `metadata` entries that remain are shared across
  clones.

Subtle. The handbook explanation doc should separate the two tables
clearly: "metadata = shared across clones, local_metadata = per-clone
state."

### C9. `DefaultDoltDatabase` constant ≠ actual default

- `01-data-model.md:§17.9` — `configfile.go` defines
  `DefaultDoltDatabase = "beads"`, but `bd init` always writes
  `metadata.json.dolt_database` to the project prefix. The constant
  applies only to cold-start bootstrapping.

Minor. Surface only in internals explanation.

### C10. HOP column drop migration is partial

- `01-data-model.md:§17.10` — migration 012 drops `quality_score` and
  `crystallizes` but leaves `hook_bead`, `role_bead`, `agent_state`,
  `last_activity`, `role_type`, `rig` in the schema. These columns are
  NOT in the `Issue` struct or `IssueSelectColumns`.

Orphaned columns. See [V1].

### C11. Two migration systems

- `01-data-model.md:§17.11` — SQL files under
  `internal/storage/schema/migrations/` AND Go migrations under
  `internal/storage/dolt/migrations/`. Both run.

Not a user concern, but worth noting for contributors.

### C12. `wisp` / `pour` asymmetry

- `03-concepts.md:1202-1210` — `pour` warns when formula has
  `phase: "vapor"` (suggesting wisp); `wisp` does NOT warn when
  formula has `phase: "liquid"` (suggesting pour).

Minor UX. Handbook how-to: just say "let `phase:` guide you; if you
pick the wrong command, you'll get a warning on pour but silence on
wisp."

### C13. No canonical bare-bd molecule discovery query

- `cmd/bd/mol*.go` — twelve `bd mol *` subcommands shipped (pour, wisp,
  current, progress, show, bond, burn, distill, last-activity,
  ready-gated, seed, squash, stale). **No `bd mol list`.** A stale
  string `"bd mol list"` exists in `cmd/bd/doctor/agent.go:520` as advice
  text but no implementation backs it.
- `internal/types/types.go:543-547` — `molecule` was removed from the
  built-in `IssueType` set; orchestrators register it via
  `bd config set types.custom`. Bare bd workspaces do not by default.
- `cmd/bd/pour.go` — `IDPrefixMol = "mol"` is the structural marker
  (every poured root carries `bd-mol-*`), but `bd list` has no
  prefix-match flag.
- `cmd/bd/list.go:380-382, 768` — `--mol-type=swarm,patrol,work`
  filters by `MolType`, but `bd pour` does not auto-set `MolType` from
  the formula's `kind` field. Most molecules have `MolType=""`.

Result: pack authors and tooling builders ("how do I list running
molecules?") have no one-liner. The realistic workaround is multi-tier:
custom-type → mol-type → epic → ID prefix (client-side filter).
Surfaced 2026-04-29 during fo-0qdg9 pair-design when designing the
bare-bd pack's `listFleetItems` implementation.

**Reconciliation**: documented in
[handbook/explanation/the-pour-pipeline.md § Discovering running molecules](handbook/explanation/the-pour-pipeline.md#discovering-running-molecules).
Long-term, a `bd list --has-children` flag or a real `bd mol list`
subcommand would be the right fix; for now packs handle it with the
heuristic.

---

## D. Orchestrator divergences

### D1. Dispatch contract: `hook_bead` vs `gc.routed_to` metadata

- `04-gastown-integration.md:§4.4` — gastown: agent bead has a
  `hook_bead` field; sling updates it; agent's startup reads it
  (GUPP rule).
- `05-gascity-integration.md:§3.2, §3.6` — gascity: sling writes
  `gc.routed_to` metadata on the *work* bead; worker's
  `EffectiveWorkQuery` queries for unassigned beads with
  `gc.routed_to=<my-pool>`.

Two fundamentally different dispatch shapes:
- gastown: push (the agent bead points at work).
- gascity: pull (the work bead is labeled for the pool).

Canonical choice for beads-ui: **gascity's model is closer to
what beads supports natively** — metadata is a first-class queryable
field; `hook_bead` requires custom interpretation. For the handbook:
describe both but lean on metadata routing for generic how-tos.

### D2. Beads integration model: shell-out vs in-process store

- `04-gastown-integration.md:§2.7` — gastown has an OPTIONAL
  `beadsdk.Storage` adapter (`NewWithStore`); default is shell-out.
- `05-gascity-integration.md:§2.6, §2.10` — gascity has a FIRST-CLASS
  `Store` interface with four implementations (MemStore, FileStore,
  BdStore, and an exec-script backend). Most gascity code is written
  against `Store`, not `bd`.

Neither imports the `github.com/gastownhall/beads` Go package. Both
shell out by default. But gascity's abstraction is richer: it supports
non-bd backends (useful for tests and hypothetical future alternative
implementations), a caching layer, and a wire-compatible exec protocol.

Canonical: **gascity's Store interface** is the more useful abstraction
for future UIs. If beads-ui ever links directly (not through the
orchestrator), gascity's `Store` would be the model to follow.

### D3. Status surface: 7 vs 6 vs 3

- beads built-ins (`01-data-model.md:§5.1`): 7 statuses.
- gascity domain model (`05-gascity-integration.md:§14.4`,
  `beads.go:18`): 3 statuses. Bd's `blocked`/`review`/`testing`/`deferred`/
  `pinned`/`hooked` collapse to `open` or `in_progress` (or `closed`).

The information loss is real. A beads-ui that talks to gascity's `Store`
sees 3 statuses; a beads-ui that talks to `bd show --json` sees the full 7
(plus any configured custom statuses). Handbook should be clear: the
canonical status set is beads's 7, orchestrators may narrow.

### D4. Mail implementation

- `04-gastown-integration.md:§7.3.1` — gastown has two mail modes:
  legacy JSONL mailbox (for crew), and beads-backed (creates
  `type=message` beads). Uses the second path for
  polecat/witness/refinery/deacon.
- `05-gascity-integration.md:§8.1` — gascity's beadmail: always
  bead-backed. Labels for threading (`thread:<id>`) and read state
  (`read`). `mail.Provider` interface supports
  `beadmail/fake/fail/exec:<script>`.

Canonical: **gascity's label-based approach**. Simpler, fits
beads's label system, and the `read` label is the obvious way to
express read/unread without a dedicated column.

### D5. Role catalog

- `04-gastown-integration.md:§4, §7.1` — gastown: mayor, deacon, boot,
  dog, witness, refinery, polecat, crew. Each is an agent bead with
  specific ID format. `role_type` field; `role_bead` pointer to a
  role-definition bead.
- `05-gascity-integration.md:§3, §10` — gascity: agent templates in
  `city.toml [[agent]]`; sessions; supervisor. "Zero hardcoded roles"
  is an invariant. Scaled pools, named sessions.

Fundamentally different philosophies:
- gastown encodes a specific role tree.
- gascity is role-agnostic; user config defines everything.

The beads-ui should not privilege either. Surface the CORE bead
concept (type + metadata + labels) and let specific role systems be
lenses on top.

### D6. Convergence / reconciliation

- `05-gascity-integration.md:§10.1` — gascity has an explicit
  convergence loop that advances beads through state machines (wisp
  lifecycle, recovery, termination).
- `04-gastown-integration.md` — gastown has no single convergence
  subsystem. State advancement is distributed across polecat lifecycle,
  refinery batch processing, deacon patrol.

Not contradictory, just different architectures. Handbook explanation
doc on agent coordination should describe both shapes.

### D7. Two Docker / deployment shapes

- `04-gastown-integration.md:§9.1-9.4` — gastown ships a Dockerfile
  with Go 1.25.8, build system deps, bd + dolt install scripts.
- `05-gascity-integration.md` — no Docker discussion; gascity is
  config-first (`city.toml`), not container-first.

Handbook: "how to install" doc can cover both, but users should pick
one orchestrator before deploying.

### D8. Event types and payload registry

- `05-gascity-integration.md:§11.1` — gascity enforces via test that
  every event-type constant has a registered payload (or
  `NoPayload`). This is a rigor choice.
- `04-gastown-integration.md` — no equivalent mechanism.

Canonical: **gascity's pattern**. If beads-ui consumes events, a
typed registry is safer. Handbook explanation could recommend the
pattern.

---

## V. Vestigial code and schema

Dead or near-dead code that the UI should not build against.

### V1. Orphaned schema columns

- `01-data-model.md:§17.1` — `hook_bead`, `role_bead`, `agent_state`,
  `last_activity`, `role_type`, `rig` columns exist in `issues` and
  `wisps` tables. NOT in the `Issue` Go struct or `IssueSelectColumns`.

They survive from an earlier HOP schema that was partially removed.
Orchestrators' use of `hook_bead` in doc 04 §A1 is the *description
field*, not the column — similar name, different location. Don't
build against the columns.

### V2. `interactions` table has no writer

See C7.

### V3. Two ID generators

See C5. The hex variant is dead.

### V4. Two helpers for adaptive ID length

- `01-data-model.md:§17.6` —
  `GenerateIssueIDInTable` (exported; adaptive birthday-paradox formula)
  vs `generateIssueIDInTable` (unexported; hardcoded length-by-count
  step function). Used by two separate CRUD entry points with subtly
  different length strategies.

Production issue-CRUD uses the adaptive form; the wisp path through
`internal/storage/dolt/transaction.go` uses the hardcoded one.

### V5. Built-in molecule registry

See C6. Shipped zero.

### V6. `bd gate check` `bead` type

See C4. Always returns false.

### V7. `bd merge-slot` removed v0.62+, but the command still exists

- `04-gastown-integration.md:§5.7` — gastown re-implemented merge-slot
  in its own code because bd's was removed. `bd merge-slot` command
  is mentioned in `02-cli-surface.md:§3.6` but not deeply covered.

Spot check needed on beads whether the command still does anything.

### V8. `federation` subsystem is optional and unused by both orchestrators

- `02-cli-surface.md:§13.2` — `bd federation` is a full subcommand
  family for peer-to-peer Dolt sync.
- `04` and `05` — neither orchestrator discusses federation.

Federation is a beads-core feature that neither orchestrator adopts.
Handbook should describe it as optional beads-direct functionality,
not central to the orchestrated model.

### V9. Legacy `wisp` (bool) field

- `02-cli-surface.md:§7.4` — importer maps the legacy `wisp` bool field
  to `ephemeral`. Not surfaced anywhere new but retained for
  backward-compat.

Import-only. Not reachable via normal CLI.

### V10. `message` type was removed, then re-promoted (GH#1347)

- `03-concepts.md:374-389` — history: `message` was in core types, got
  pushed to custom-only alongside `molecule`/`gate`/etc., then
  re-promoted to built-in because inter-agent communication is too
  central.

Not vestigial per se, but the schema history is weird. Both
orchestrators assume `message` is built-in; the `types.go:543-547`
comment records the back-and-forth.

### V11. `gc.source_step_spec` metadata key — read-only legacy backstop (gascity)

- `gascity-metadata-deep-dive.md` §14 — read at
  `internal/dispatch/control.go:254`; never written in current non-test
  code. Replaced by `gc.kind="spec"` beads. Source-spec tests at
  `internal/formula/source_spec_test.go:36-77` explicitly assert the
  key is empty on modern control beads.

### V12. `gc:message` label — removed (gascity)

- `gascity-metadata-deep-dive.md` §10, §14 — legacy discriminator for
  mail beads, removed in gascity #862
  (`internal/mail/beadmail/beadmail.go:250-251,294-295`). `bead.Type
  == "message"` is now the authoritative discriminator.

### V13. `gc.formula_name` — reader without a writer (gascity)

- `gascity-metadata-deep-dive.md` §8, §13.5 —
  `internal/api/orders_feed.go:405` reads the key as a
  display-name fallback, but **no code writes it** in the current
  tree. Either the write path was removed (remove the read), or the
  feature was never wired (add the writer). Status: **flag before
  documenting.**

### V14. `gc.session_affinity` — unverified (gascity)

- Handbook cites `gc.session_affinity` per stored memory
  `phase-1-bead-reappears…`. The deep-dive
  (`gascity-metadata-deep-dive.md` §13.6) did not find the string
  literal in the current gascity tree. Either:
  - The key exists under a constant name missed by the scan.
  - The feature is aspirational / not yet wired.
  - The feature was removed after the stored memory was written.

  Demoted in `handbook/reference/metadata-conventions.md` pending
  verification.

### V15. Dead code using wrong label spelling (gascity)

- `gascity-metadata-deep-dive.md` §13.4 —
  `internal/agentutil/pool.go:52` queries label `"gc.session"` (dot);
  session beads are tagged `"gc:session"` (colon). The query silently
  returns zero results. The function is shadowed by the cmd/gc copy
  at `session_name_lookup.go:146` so the bug is latent — removing the
  cmd/gc copy would re-introduce a regression. Upstream fix
  recommended.

### V16. `role_bead` description field — removed (gastown)

- `gastown-conventions-deep-dive.md` §23 — the description-field key
  was purged when role definitions moved to
  `internal/config/roles/*.toml`. Comment at
  `gastown/internal/beads/beads_agent.go:46-48,92-93` notes the
  purge. Legacy agent beads may still carry the field; new writers
  don't emit it.

### V17. `gt:standing-orders`, `gt:role`, `gt:owned-direct` labels — reader-only (gastown)

- `gastown-conventions-deep-dive.md` §23 — each label has a reader
  in the current gastown tree but no writer found in non-test paths.
  Either external callers produce them, the writers were removed, or
  they were never wired. Flag each for decision:
  - `gt:standing-orders` — reader at `beads.go:260`, `reaper.go:603`.
    Documented in `IsProtectedBead`.
  - `gt:role` — reader at `internal/cmd/ready.go:421` + doctor tests.
  - `gt:owned-direct` — reader at
    `internal/refinery/engineer.go:1628`. Probably an MR opt-out
    that was never shipped.

### V18. `claimed-by:<identity>` mail label — reader-only (gastown)

- `gastown-conventions-deep-dive.md` §23 — reader at
  `internal/mail/types.go:358-359`,
  `internal/cmd/mail_queue.go:233-234`. No explicit write site found
  in non-test paths. Either intended to be written via external
  `bd update` calls, or never wired. Flag.

### V19. bd `slot` command + agent-bead slots — removed (gastown)

- `gastown-conventions-deep-dive.md` §23 — `bd slot` was removed in
  v0.62. The description-field `hook_bead` is the replacement for the
  hook slot; role definitions moved to TOML. `beads_agent.go:346-347,426-428`
  and `beads_delegation.go:52-54` describe the migration.

---

## Concept ownership — what's canonical vs orchestrator-layered

Feeds the `handbook/explanation/canonical-vs-vestigial.md`.

### Canonical (beads-core owns; orchestrators consume)

| Concept | Source |
|---|---|
| The bead (row) and its schema | beads: `internal/types/types.go`, migrations |
| Dependency graph (20 dep types) | beads: `types.go:764-801`, view |
| Labels (free-form) | beads: `labels` table |
| Metadata (arbitrary JSON) | beads: `metadata` column |
| Status lifecycle (7 built-in + custom) | beads: `types.go:323-334` |
| Ready-work view (blocks-dep + deferred-parent CTE) | beads: `migrations/0025` |
| Formulas (4 types, TOML/JSON) | beads: `internal/formula/types.go` |
| Molecules as protos in `.beads/molecules.jsonl` | beads: `internal/molecules/` |
| Wisp / ephemeral routing | beads: `wisps` table + dolt_ignore |
| Gates (async wait conditions) | beads: `cmd/bd/gate.go` + schema columns |
| Hook runner (on_create/on_update/on_close) | beads: `internal/hooks/` |
| Git hooks (install + shim) | beads: `cmd/bd/hooks.go` |
| `bd prime` session-start contract | beads: `cmd/bd/prime.go` |
| Memory (`kv.memory.<slug>`) | beads: `cmd/bd/memory.go` |
| Tracker integrations (6 backends) | beads: `internal/tracker/` |
| JSON output / hook-injection formats | beads: `cmd/bd/output.go` |
| Dolt storage + commit policy | beads: `internal/storage/dolt/` |
| Federation / Dolt peer sync | beads: `cmd/bd/federation.go` |
| Compaction (tiered AI summary) | beads: `internal/compact/` |
| `bd doctor` diagnostics | beads: `cmd/bd/doctor.go` |
| Cross-prefix dep references | beads: `internal/storage/issueops/dependencies.go` |
| Hierarchical IDs (`parent.N`) | beads: `internal/types/id_generator.go` |

### Orchestrator-owned (neither is canonical; both valid)

| Concept | Gastown | Gascity |
|---|---|---|
| Agent identity / lifecycle | `internal/agent/`, `beads_agent.go` | `internal/agent/`, `cfg.Agent` |
| Role catalog | hardcoded (mayor/deacon/…) | config-driven (`city.toml`) |
| Dispatch / sling contract | `hook_bead` field on agent bead | `gc.routed_to` metadata on work bead |
| Convoy runtime | `internal/convoy/`, `gt convoy` | `internal/convoy/`, `gc convoy` |
| Mail transport | `internal/mail/`, beads-backed w/ JSONL fallback | `internal/mail/beadmail/`, labels for thread/read |
| Nudge delivery | `internal/nudge/` poller + tmux send-keys | `internal/nudgequeue/` deferred + prompt injection |
| Session management | tmux registry | `internal/session/`, multi-provider |
| Queue (claim patterns) | `internal/beads/beads_queue.go` | via pool `scale_check` |
| Scheduler / capacity | `internal/scheduler/capacity/` | reconciler + pool model |
| Convergence | distributed | `internal/convergence/` |
| Event log | implicit | `.gc/events.jsonl` with registry |
| Supervisor / multi-city | — | `internal/supervisor/` |

### Split ownership (ambiguous — code lives on both sides)

| Concept | What's where |
|---|---|
| Formula compilation | beads has `bd cook`; gastown embeds at build time; gascity has its own compiler with graph.v2 contract |
| Molecule lifecycle | beads owns `bd mol current/progress`; orchestrators own instantiation |
| Hook protocol | beads owns the mutation hook surface; gastown/gascity register handlers |
| Gate resolution | beads owns `bd gate check`; external systems (gh, mail) satisfy |
| Escalation | partial: gastown has `beads_escalation.go` + `gt escalate`; beads has `--escalate` on gate check |

---

## Recommendations for the beads-ui

Direct consequences for the UI work at
`github.com/cwalv/beads-ui-prototype`:

1. **Lead with beads-core concepts.** Teach the bead, the dep, the
   status, the label, the metadata, the formula, the molecule, the
   hook. These are the load-bearing concepts across all orchestrators.
2. **Route-by-metadata is canonical dispatch.** Even though gastown
   uses `hook_bead`, the metadata approach is simpler, more
   queryable, and transfers better to a generic UI. Surface
   `gc.routed_to` (or equivalent) as the dispatch signal.
3. **Use labels for threading, read-state, and queue membership.**
   This matches gascity's mail implementation and fits beads's
   label-centric ethos.
4. **Skip federation, `bd preflight` (in generic use), the `pinned`
   boolean column, the `hooked` status (except for display), and
   legacy compatibility fields.** Flag only for
   maintenance dashboards.
5. **Treat the events log pragmatically.** Don't try to unify; let
   users pick a source (bd events table = dead; `type=event` beads =
   optional; `.gc/events.jsonl` = gascity-only).
6. **`bd mol current` is the step-at-a-time runner.** Use it for
   molecule navigation; don't reimplement step tracking in the UI.
7. **Hooks are the invalidation path.** Any UI cache should listen
   on the hook bus (or `.gc/events.jsonl`), not poll.
8. **Multiple "molecule" meanings are the hardest naming hazard.**
   Define your vocabulary early: "molecule" (root bead) vs
   "template/proto" vs "step workflow".
9. **Gates are important but under-loved.** `bd gate` is a first-class
   async-wait primitive. A UI that surfaces "blocked by X gate" makes
   the system legible.
10. **Memories are a distinct KV space.** They're not beads. UI should
    treat them as first-class but separate.

---

## Metadata namespace findings

Consolidated from the gascity metadata deep-dive
([../gascity-metadata-deep-dive.md](gascity-metadata-deep-dive.md) —
wait, this is in the same directory so it's
[gascity-metadata-deep-dive.md](gascity-metadata-deep-dive.md)).

Big-picture findings:

- **~60 `gc.*` metadata keys** in active use; the handbook initially
  documented ~25 (≈40% coverage).
- The biggest missing clusters: retry / control-loop (~20 keys),
  exec output (6 keys), step identity (5 keys), plus the entire
  `convergence.*` namespace (28 keys).
- `gc.kind` has more values than previously documented
  (`retry-eval`, `scope`, `spec`, `task`, `run`, `cleanup`,
  `retry-run` were missing).
- **No central registry** — keys are introduced per-subsystem. The
  deep-dive is the closest thing to an enumeration; a future cleanup
  would be a `package gcmeta` with exported constants.
- `convergence.*` is a **separate namespace** (28 keys) that wasn't
  acknowledged in the handbook at all until the deep-dive. Now lives
  at [handbook/reference/convergence-metadata.md](handbook/reference/convergence-metadata.md).

Updated handbook:
[handbook/reference/metadata-conventions.md](handbook/reference/metadata-conventions.md)
now covers the full set. Individual vestigial keys (`gc.source_step_spec`,
`gc:message`) and flagged inconsistencies (`gc.formula_name`,
`gc.session_affinity`, label typo) are in §V11-V15 above.

### Gastown convention findings (parallel deep-dive)

From `gastown-conventions-deep-dive.md` (fo-d9mjy):

- **Gastown uses three substrates**, not one: labels (~60 patterns),
  description fields (~65 keys across 11 bead kinds), and exactly
  **one** metadata-column key (`delegated_from`).
- The handbook previously documented only the label surface.
  Description fields — gastown's functional equivalent of gascity's
  `gc.*` keys — were completely absent.
- Two bead kinds use **JSON** descriptions instead of key:value
  (`gt:merge-slot`, `gt:sling-context`). UIs must detect format before
  parsing.
- `role_type` is **dual-representation** (label on dogs, description
  field on other agents). Noted in V17-adjacent territory.
- `IsProtectedBead` defines a "do not auto-close" label set:
  `gt:standing-orders`, `gt:keep`, `gt:role`, `gt:rig`. Documented in
  the new handbook page.
- No `gt.*` metadata namespace exists. The contrast with gascity
  (~60 `gc.*` keys) is a clean architectural difference.

Individual vestigial / incomplete findings are in §V16-V19 above.

Updated handbook:
[handbook/reference/gastown-conventions.md](handbook/reference/gastown-conventions.md)
is the new home for the gastown catalog;
[metadata-conventions.md](handbook/reference/metadata-conventions.md)
has a trimmed `gt:*` overview + pointer.

---

## Open items for the handbook phase

Issues this audit raised that the handbook should resolve or escalate:

- Where does the `handbook/reference/dependency-types.md` draw the
  canonical list from — the `types.go:764-801` constants or the
  `ready_issues` view? Answer: both, with the view as authoritative
  for ready semantics.
- Should the handbook document `gt sling` and `gc sling`? Not as
  first-class — brief cross-refs only. Emphasis stays on beads.
- Threading: the handbook's mail how-to should note that *neither*
  orchestrator uses the `DepRepliesTo` schema; explain label
  convention and link here.
- `hooked` status: the lifecycle reference should note orchestrator
  convention without promoting it to "canonical."
- Gate registration: the quickstart should include
  `bd config set types.custom "gate,convoy,molecule"` (or point at
  whichever types the target orchestrator expects).

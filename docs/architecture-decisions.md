# Architecture decisions — beads-ui

Living document. First decisions landed 2026-04-25 during a `fo-zz4pz`-prep
review session. Update in place as decisions evolve or get superseded.

## Why this doc exists

The beads-ui catalog (`fo-zz4pz`) reviews the shipping UI surface-by-surface
and produces specific feature/fix decisions. Many of those rows are domain
calls (gates as first-class, capture missing fields, queue urgency) — but
several are downstream effects of three load-bearing **architectural**
calls. Litigating them per-row would mean re-deciding the same thing 5+
times.

This doc captures those three calls so the catalog walk can lean on them.

Source material:

- [`ui-review.md`](ui-review.md) — handbook-grounded UI review
- [`gaps-audit.md`](gaps-audit.md) — cross-doc inconsistencies
- [`01-data-model.md`](01-data-model.md) — bd schema reference
- [`gascity-metadata-deep-dive.md`](gascity-metadata-deep-dive.md)
- [`gastown-conventions-deep-dive.md`](gastown-conventions-deep-dive.md)
- [`projects/foundations/docs/agent-persona/ousterhout-philosophy-of-software-design.md`](../agent-persona/ousterhout-philosophy-of-software-design.md)

## Layered architecture (the result)

```
┌──────────────────────────────────────────────────────────────────┐
│  Clients: web UI, Electron UI, CLI dashboards, slackbots, …     │
└──────────────────────────────────────────────────────────────────┘
                              ↑
┌──────────────────────────────────────────────────────────────────┐
│  Convention layer (shared TS lib)                                │
│  Per-orchestrator packs · aggregations · graph walks · rollups   │
└──────────────────────────────────────────────────────────────────┘
                              ↑
┌──────────────────────────────────────────────────────────────────┐
│  bd-interface drivers (bd-server-http | localBd-stdio | bdJs-…)  │
│  Generic; ecosystem-blind; transport adapters for the bd API     │
└──────────────────────────────────────────────────────────────────┘
                              ↑
                            [ bd ]
```

Three interfaces, each owned by one of the three decisions below:

1. The **bd API** itself, defined in protobuf — Decision 1.
2. The **driver** abstraction (one impl per transport) — Decision 2.
3. The **convention layer** above drivers — Decision 3.

---

## Decision 1: Domain model is proto-generated, read-side first

### Problem

`ui/src/types/index.ts` (78 lines) is the change-amplification choke point
and a textbook shallow module. It:

- Drops `pinned` and `hooked` from the 7 built-in statuses.
- Includes 4 customs (`merge-request`, `agent`, `role`, `convoy`) as if
  built-in; drops 4 actual built-ins (`decision`, `story`, `milestone`,
  `spike`).
- Exposes 7 of 20 dep types.
- Misses ~25 schema fields on `Bead` (gate fields, ephemeral, owner,
  closed/started/defer/due timestamps, source provenance, …).
- Has no extension surface for bd's user-configurable customs
  (`bd config set types.custom "..."`).

Every component imports literal-union enums; adding a value sweeps the
codebase. bd's full schema leaks through this single file.

### Decision

Define bd's wire schema in **protobuf**. Generate TS and Go types from
the `.proto` files. Treat the protos as the canonical bd interface
contract — drivers expose them, the convention layer consumes them, and
in time bd itself adopts them upstream.

### Scope

- **v1: read-side only.** Messages `Bead`, `Dependency`, `Comment`,
  `Workspace`, `Formula`-related types. Services `List`, `Show`, `Ready`,
  `FormulaSchema`, `FormulaList`.
- **v2 (deferred):** write-side. `Create`, `Update`, `Close`, `Comment`,
  dep mutations, etc. Two-ish times the design surface; defer until v1
  reads stabilize.

### Schema notes

- **Custom-supporting fields (`status`, `type`, `dep_type`) are `string`,
  not proto enums.** Proto enums are closed; bd supports custom values.
  The library documents well-known canonical values and renderers narrow
  on them; customs pass through with a neutral fallback render.
- **Field numbers are forever** once published. First-pass numbering uses
  [`01-data-model.md`](01-data-model.md) as the authoritative reference;
  reserve liberally for known-gap fields.
- **Wire format stays JSON via protojson** on existing REST endpoints.
  No gRPC for v1. (Connect-RPC is worth revisiting later — gives gRPC and
  HTTP/JSON from one definition.)

### Location and toolchain

- Files: `beads-ui-prototype/proto/`.
- Lint / format / breaking-change detection: [`buf`](https://buf.build).
- TS codegen: [`bufbuild/protobuf-es`](https://github.com/bufbuild/protobuf-es)
  (no class hierarchies; JSON-friendly).
- Go codegen: `protoc-gen-go` standard.

### Upstream intent

cwalv has landed beads PRs. Plan: build the protos in `beads-ui-prototype`,
harden against real client use, then propose to bd as `bd serve` (or
similar). Drivers shipped here become the reference impls; bd's `bd serve`
becomes the canonical impl.

### What this resolves

- The "broaden domain model" must-fix from `ui-review.md` (cross-cutting §1).
- The narrow-enum bug (statuses, types, dep types).
- Forward-compat for future bd schema additions (proto field numbers +
  zero defaults make new fields backwards-compatible by construction).
- Hand-rolled `bd --json` parsing across gastown / gascity / future
  clients — they consume generated types instead.

---

## Decision 2: bd-server is a transport driver, not a domain layer

### Problem

`bd-server` today is a shallow HTTP/JSON pass-through: `POST /v1/bd { args }`
shells out `bd --db=<workspace> --json <args>` and returns the output.
SME (initial reading) flagged this as Ousterhout-shallow and proposed
deepening it. cwalv corrected: **shallowness is the design intent**.

bd-server is one implementation of "the bd interface" — the browser case.
Other transports (local shell-out for Electron, stdio for embedded, in-
process for WASM) are valid alternates. Making bd-server "deep" would
fork the interface from bd's actual surface and complicate other-transport
implementations.

### Decision

bd-server stays a transport driver. **Domain logic does not live in
drivers.** All drivers implement the same proto service from Decision 1;
they differ only in transport. The convention layer (Decision 3) sits
above the drivers and consumes whichever one is wired in.

### Driver contract

Implements the proto service. Transports usable today / soon:

- **HTTP + protojson** — bd-server, current. Browser case.
- **stdio** — `bd serve --stdio` spawned by Electron / desktop apps; no
  port, no auth, simple lifecycle.
- **Unix socket** — high-perf local case for daemons.
- **in-process** — eventually a WASM build of bd's read paths for fully
  offline / preview cases. Speculative; not v1.

bd-server keeps `/v1/bd` as a low-level escape hatch (dev tooling needs
it). Domain endpoints are not added there; new typed services come from
the proto.

### What this resolves

- bd-server doesn't grow into a service that has to be maintained as a
  separate domain.
- The Electron / standalone path is unblocked: it gets the same client
  code, just a different transport.
- The upstream-to-bd story stays clean — drivers are thin and proto-defined,
  not custom services to merge upstream.
- Aligns with bd's generic-by-design ethos.

---

## Decision 3: Convention layer above the driver — shared TS library

### Problem

bd is generic: free-form metadata, free-form labels, free-form descriptions.
Orchestrators layer conventions on top:

- **gascity** — ~60 `gc.*` metadata keys, ~28 `convergence.*` keys, small
  label set.
- **gastown** — ~65 description-field key:value patterns across 11
  bead-kinds, ~60 label patterns, exactly one metadata key.
- **Bare bd** — neither.

*Some* layer has to translate `Bead { metadata: { "gc.attempt": 3 } }`
into a `FleetItem { primaryLabel: "retry", badges: [{ label: "retry 3/5", tone: "warn" }] }`
(or, for gastown, an `agent_state="working"` description-field on a
`gt:agent` bead into a polecat row in Fleet). That layer cannot be bd
(generic by design) and should not be the driver (transport-only by
Decision 2). It must be above.

The current UI bakes this knowledge into components silently — ~50–60% of
the Observe/Fleet surface is silently gascity-coupled. Adding gastown
support today would mean per-component edits across the UI.

### Decision

Ship a shared TS library (working name: `@beads-ui/conventions` —
final name TBD) with **per-orchestrator packs**. UI imports the library
and a driver; library detects orchestrator from workspace markers; client
gets shaped data.

### Pack interface (v1, refined 2026-04-29)

The v1 spec is on [`fo-0qdg9`](../../../../.beads)'s design field. Sketch:

```ts
interface FleetItem {
  id: string;
  title: string;
  primaryLabel: string;       // pack-emitted: 'running' | 'working' | 'at-gate' | 'pending-merge' | etc.
  primaryTone: 'info' | 'warn' | 'error' | 'neutral';
  progress: number | null;    // 0..1, or null when "progress" is not meaningful
  badges: Badge[];
  packData: unknown;          // pack-specific drill-in data
}

interface OrchestratorPack {
  name: string;
  detect(workspace: WorkspaceInfo): boolean;

  // Capability flags — UI hides surfaces when false
  capabilities: {
    moleculeGraph: boolean;    // does the per-molecule Graph view apply?
  };

  // Fleet — every pack provides discovery + transformation.
  // Each pack defines what its "active units of work" are: gascity =
  // molecules; bare = molecules (heuristic discovery); gastown =
  // polecats + rigs + merge-slots.
  listFleetItems(driver: Driver): Promise<FleetItem[]>;

  // Display rules
  badgeRules: BadgeRule[];          // metadata/label → chip
  metadataDisplay: KeyDisplayMap;   // friendly labels for known keys
}
```

Earlier sketches used `MoleculeAgg` and `aggregateMolecule(root, children)`.
That naming presumed all packs render molecules in Fleet — wrong for
gastown, whose primary substrate is agents/polecats/rigs. The renamed
`FleetItem` + `listFleetItems(driver)` shape lets each pack define its
own discovery query and transformation. The Graph view (per-molecule
DAG) stays gascity/bare-only, gated by `capabilities.moleculeGraph`.

### Library structure

Two directories with different upstreaming destinies:

- **`packs/`** — purely orchestrator-specific knowledge. "For gascity,
  the retry-attempt key is `gc.attempt`." Permanent home; doesn't move.
  - `packs/gascity.ts`
  - `packs/gastown.ts`
  - `packs/bare.ts` — fallback. Renders raw values; does not invent
    rollups.
- **`aggregations/`** — shaping that *wants* to be canonical eventually.
  Rollups, graph walks, ready-set computation. Lives in TS today; can
  migrate downward into bd over time as the upstream surface grows.

This split signals to future maintainers which code is forever and which
is "until bd grows the verb."

### Auto-detection (refined 2026-04-29)

Pack selection lives in **bd-server's own config** (separate from
`bd config`) — per-workspace `pack` field. Auto-detect (filesystem
markers — `.gc/` for gascity, `mayor/town.json` for gastown) seeds the
default at workspace registration; operator escape hatch is editing the
config. Bare-bd is the safe fallback for any unknown value.

Implementation: extends the `Workspace` proto (added by fo-zsazt) with an
optional `pack: string` field. bd-server detects server-side; client
just reads `workspace.pack` and dispatches. Graceful fallback to bare on
unknown pack names.

This is a slight extension of "drivers stay thin" (Decision 2) — pack
selection is a transport-level concern (which workspace, which pack
governs it), not a domain concern, and bd-server has the filesystem
view that makes auto-detect trivial. If it ever grows beyond a 5-line
filesystem probe, revisit.

### What this resolves

The current orchestrator coupling in `lib/molecule-agg.ts`,
`components/editor/DAG.tsx`, `client/formula.ts`, and Fleet rendering all
moves into the library. UI components consume `FleetItem` /
`ParsedFields` / `BadgeRule[]` and don't need to know which orchestrator
provided them.

It also gives a clear answer to several catalog rows in `fo-zz4pz`:

- **§6 wisp badge** — pack publishes `isWisp(bead)` predicate.
- **§7 continuation-group swimlanes** — pack publishes group metadata;
  UI chooses rendering shape.
- **§8 var form schema (`[vars.X.ui]`)** — extension to the proto
  `FormulaSchema` shape from Decision 1; library helps render it.
- **§10 workspace consolidated mode** — library's responsibility to
  merge across drivers; UI just renders.
- **`ui-review.md` cross-cutting §2** (metadata convention packs) —
  resolved by Decision 3 directly.

---

## Decision 4: Theming foundation — L1 dark mode + token discipline as forcing function

### Problem

beads-ui ships single-theme today. The token foundation is good — ~20
semantic tokens in `ui/src/styles/tokens.css` (`--ink/-2/-3`, `--bg/-2/-3`,
`--accent` + soft, `--warn`/`--ok`/`--danger` + soft, `--rule`, `--mute`,
`--font-*`) and ~89% of color usage already goes through `var()`. But
every sprint adds new hardcoded colors:

- ~100 inline `style={{ color: '#...' }}` uses across components.
- `.st-prog` `#b8892b` — the one status that escaped the token system.
- `GROUP_PALETTE` (`GraphCanvas.tsx`): 5 hex colors for graph-group bgs.
- workspace `PALETTE` (`workspace-color.ts`): 8 hex colors keyed by name
  hash.
- formula syntax highlighting (`editor.css`) — `.t-key`/`.t-str`/etc. use
  GitHub-light hex literals with no token abstraction.
- doc code blocks (`learn.css`) — deliberately always-dark (`#0f1419`,
  `#d4dae0`) but as raw hex, not tokens.

The drift mechanism is "no failing test." A literal `#222` looks fine
against one background; against two, one is broken. With a single theme
there is no forcing function — visual review can't catch what nothing
breaks. The token vocabulary stays good in aggregate while the gaps grow
quietly.

### Decision

Adopt **L1 theming**: dark-mode token overrides on a `data-theme`
attribute, a small `ThemeContext` + topbar switcher (auto / light / dark),
localStorage persistence (`beads-ui.theme`), FOUC prevention via inline
pre-mount script, a literal-cleanup pass across components, and lint
enforcement preventing regression to hardcoded colors.

Defer **L2 theming-as-data** (JSON registry, runtime theme loader,
user-customizable themes, theme marketplace) until a real driver appears
— >2-3 themes needed, or community/user-defined themes requested. L1's
`data-theme` + CSS-variables shape is exactly what L2 would build on;
nothing about L1 is wasted if L2 lands later.

Open questions resolved at decision time (2026-05-06):

- **Three-state vs binary switcher** — three-state (auto / light / dark).
  `auto` follows `prefers-color-scheme`; explicit choice persists in
  localStorage. Modern default; the `auto` option is small surface for
  the right-thing-by-default behavior.
- **Switcher placement** — topbar, next to the workspace switcher.
  Parallel "user preference" affordance.
- **This decision-doc entry** — yes, this is a load-bearing
  architectural call parallel to Decisions 1–3.

Deferred to phase-3:

- **Workspace palette: HSL-derived vs per-theme arrays.** Lean
  HSL-derived from `--accent` + name-hash + hue rotation; revisit if
  hand-tuning is needed for perceptual distinctness.
- **Doc code blocks: always-dark vs theme-aware.** Lean keep
  always-dark, but tokenize the choice (`--code-bg` / `--code-fg` /
  `--code-border`) so the decision is documented as tokens rather than
  hex literals.

### Why this works — forcing-function argument

The pitch is *prevention*, not feature. Two themes turn theme-blindness
from a one-time cleanup into a CI concern:

1. **Hardcoded colors become visible bugs.** Dark-mode users see them on
   the next PR; visual review has teeth it didn't have before.
2. **Token vocabulary settles.** L1 cleanup forces decisions on the
   current gaps (syntax tokens, code-block tokens, status tokens,
   workspace tokens). Once they exist, new code reaches for them —
   gravitational pull, the same reason 89% is already tokenized today.
3. **Lint gets teeth.** stylelint `color-no-hex` and an ESLint
   inline-style-hex rule are realistic gates only when a working theme
   exists that breaks if you violate them.
4. **Tricky bits get pre-empted.** Future syntax categories use existing
   `--syn-*` tokens. Future status colors use `--st-*` tokens — no new
   `#b8892b` one-offs. Future code-block surfaces inherit the documented
   decision instead of re-litigating it.

L1 turns theme-blindness from recurring cleanup into prevention. The
cleanup pass has to happen for L1 to ship — without L1 you'd pay it
again in 6 months as new literals accumulate.

### Phasing

Each phase is independently landable.

1. **Tokens + provider (phase-1).** Dark token override block,
   `ThemeContext`, topbar switcher, FOUC script, this decision entry.
   After phase-1 dark mode works for tokenized surfaces; hardcoded
   literals are visibly broken (cleanup-pass fodder).
2. **Literal-cleanup — components (phase-2).** Walk `ui/src/routes/`
   and `ui/src/components/`, fix inline hex literals, visual review per
   surface in both themes.
3. **Tricky-bit decisions + cleanup (phase-3).** Workspace palette
   (HSL-derived from `--accent`), doc code blocks (tokenize the
   always-dark choice), formula syntax tokens (`--syn-*`).
4. **Lint enforcement (phase-4).** stylelint + ESLint rules +
   `theme-exempt` comment convention for legitimate exceptions
   (chart palettes, heatmaps).
5. **Handbook entry (phase-5).** "How theming works in beads-ui" —
   token list, how to add a token, how to opt out, the tricky-bit
   decisions.

### Out of scope

- **L2 themes-as-data** — JSON registry, runtime theme loader,
  user-customizable themes. Separate decision when a real driver
  appears.
- **Token misuse** (`--accent` where `--accent-soft` was correct) —
  visual review catches this; lint can't.
- **Image / SVG assets with baked colors** — none today; flag in the
  handbook when authoring guidance lands.
- **Print stylesheets / OG cards / exported reports** — non-existent
  today.

### What this resolves

- The cross-cutting "theme-blindness" risk that would otherwise
  compound with every new component.
- A clean home for the existing tricky bits (formula syntax, doc code
  blocks, workspace palette) that have lived as documented exceptions.
- A lint surface that didn't make sense before — `color-no-hex` only
  earns its keep when a working theme breaks if you violate it.

### References

- [`fo-x00u4.5`](../../../../.beads) — phase-1 implementation (this
  decision's source bead, with the full design narrative in its
  `design` field).
- Style inventory captured 2026-05-06: ~854 `var()` uses, ~100 inline
  hex literals, ~20 semantic tokens, hardcoded exceptions in
  `editor.css`, `learn.css`, `GraphCanvas.tsx`, `workspace-color.ts`.

---

## Implementation ordering (suggested)

These are the natural dependencies. Each step is independently shippable.

1. **Proto toolchain in `beads-ui-prototype/`** — `buf` config, codegen
   pipeline, CI break-detection. ~1 day.
2. **v1 proto schema** — `Bead`, `Dependency`, `Comment`, `Workspace`,
   formula types. Services `List` / `Show` / `Ready` / `FormulaSchema` /
   `FormulaList`. Reference `01-data-model.md` for field surface. Slow,
   careful pass — field numbers are forever.
3. **UI consumes generated types** — replace `ui/src/types/index.ts`
   imports. Sweep call sites; surface and fix the now-revealed gaps
   (status `pinned`/`hooked`, missing dep types, missing schema fields).
4. **Convention library skeleton** — workspace package layout, pack
   interface, gascity pack as the first concrete impl (extracted from
   current `molecule-agg.ts` / `DAG.tsx` / `formula.ts`).
5. **Bare-bd pack** — verify Fleet renders something sensible against a
   no-orchestrator workspace.
6. **Gastown pack** — first cross-orchestrator stretch. Description-field
   parser. Label rules. Validates the pack interface.
7. **Write-side proto** — `Create`, `Update`, `Close`, dep mutations,
   `Comment`. v2.

In-flight UI work (e.g., `fo-totkk` editable steps) ships against the
old types and gets refit during step 3. Don't pause it; the refit is
mechanical.

## Out of scope

- **Don't proto the convention layer types** (`FleetItem`, pack
  interface). They stay TS-only for v1. Revisit when conventions stabilize
  and we want cross-language packs.
- **Don't switch wire to gRPC** — protojson on REST is fine.
- **Don't auto-generate proto from bd's Go structs** — too brittle until
  bd stabilizes. Hand-author proto; drift-test against bd's `--json`
  output.
- **Don't move bd-server into a separate repo** — keep in prototype.

## Open questions

- **Pack detection precedence** when multiple markers present (e.g., a
  workspace with both `.gc/` and gastown-style description fields)?
  Unlikely in practice; revisit if it actually happens.
- **Bare bd's status rollup** — probably no rollup at all; render raw
  statuses without inventing one. Confirm during step 5.
- **Long-term: does bd grow native pack-loading** (Ousterhout's "plugin
  inside the tool" option)? Not v1; revisit if non-gastown / non-gascity
  orchestrators emerge.

## References

- [`fo-zz4pz`](../../../../.beads) — living UI v1 catalog (next pass)
- [`fo-beads-ui-epic`](../../../../.beads) — parent epic
- `bd serve` — speculative future bd subcommand that would absorb
  bd-server upstream

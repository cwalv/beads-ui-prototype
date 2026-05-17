# beads handbook

A [Diátaxis](https://diataxis.fr/)-structured reference to **beads** — the
`bd` CLI, the bead data model, and the concepts beads ships. The primary
source is the code in `github/gastownhall/beads/`; cross-references to
how `gastown` and `gascity` consume beads are included where they help
disambiguate.

This handbook is derived from the deep-dive docs one level up
(`01-data-model.md` through `05-gascity-integration.md` and
`gaps-audit.md`). Those remain the raw material; this is the organized
presentation.

## Emphasis

**Beads, not the orchestrators.** gastown and gascity show up as evidence
for vestigial-vs-canonical calls — never as first-class subjects. When a
beads feature exists but neither orchestrator exercises it, that's flagged.
When both use the same convention on top of beads, that convention is
canonical.

## The four quadrants

Each quadrant serves a different purpose. Pick the one that matches your
need.

- **[tutorials/](tutorials/README.md)** — *learning-oriented*. Guided
  walkthroughs for someone new to beads. Start here if you want to see
  the tool work before understanding why.
- **[how-to/](how-to/README.md)** — *task-oriented*. Recipes for specific
  jobs. Assumes you already know what the tool does; want to know how to
  do X.
- **[reference/](reference/README.md)** — *information-oriented*.
  Structured facts: schema, commands, wire formats. Go here when you
  know what you're looking for and need the details.
- **[explanation/](explanation/README.md)** — *understanding-oriented*.
  Why beads exists, how its pieces fit together, and which parts are
  canonical vs vestigial. Read these when the shape of the system isn't
  clicking.

## Recommended reading orders

Choose the path that fits.

### You're building a UI over beads

1. [explanation/why-beads.md](explanation/why-beads.md) — what beads is
   solving.
2. [explanation/the-store-architecture.md](explanation/the-store-architecture.md)
   — where data lives.
3. [reference/bead-schema.md](reference/bead-schema.md) — what a bead is.
4. [reference/json-outputs.md](reference/json-outputs.md) — what the wire
   format is.
5. [reference/hook-protocol.md](reference/hook-protocol.md) — how to
   listen for writes.
6. [explanation/canonical-vs-vestigial.md](explanation/canonical-vs-vestigial.md)
   — which features to build for and which to hide.
7. [reference/metadata-conventions.md](reference/metadata-conventions.md) —
   the `gc.*` / `gt:*` conventions your UI will encounter.

### You're new to beads and want to use it

1. [tutorials/01-your-first-bead.md](tutorials/01-your-first-bead.md)
2. [tutorials/02-working-with-dependencies.md](tutorials/02-working-with-dependencies.md)
3. [explanation/why-beads.md](explanation/why-beads.md)
4. [tutorials/03-pouring-a-formula.md](tutorials/03-pouring-a-formula.md)
5. [how-to/](how-to/README.md) as needs arise.

### You're diagnosing a specific problem

1. [reference/bd-commands.md](reference/bd-commands.md) to find the right
   subcommand.
2. [how-to/](how-to/README.md) for the recipe.
3. [explanation/](explanation/README.md) if the recipe's assumptions
   aren't clicking.

### You're a contributor to beads (or an orchestrator)

1. [explanation/the-store-architecture.md](explanation/the-store-architecture.md)
2. [explanation/the-pour-pipeline.md](explanation/the-pour-pipeline.md)
3. [explanation/agent-coordination.md](explanation/agent-coordination.md)
4. [explanation/beads-and-orchestrators.md](explanation/beads-and-orchestrators.md)
5. [reference/](reference/README.md) as needed.

## Conventions

- **Code is authoritative.** Every non-trivial claim in this handbook
  traces back to a file and line in `github/gastownhall/beads/`. Where a
  claim comes from beads's own docs, the code is double-checked.
- **Paths** are workspace-relative (e.g.,
  `github/gastownhall/beads/internal/types/types.go:16`).
- **Examples are real.** Commands in tutorials and how-tos work against
  a fresh `bd init`; formulas parse; JSON shapes compile.
- **Vestigial features** are marked explicitly. They appear in the
  reference for completeness but aren't the recommended path.

## Not covered

- Deep gastown internals (agent lifecycle, merge-queue mechanics, crew
  sessions). See [04-gastown-integration.md](../04-gastown-integration.md).
- Deep gascity internals (convergence, supervisor, pack composition,
  scheduler). See [05-gascity-integration.md](../05-gascity-integration.md).
- Specific tracker (Jira, Linear, GitHub Issues, …) integration details
  beyond the command reference. See the tracker integration sections in
  [02-cli-surface.md](../02-cli-surface.md).

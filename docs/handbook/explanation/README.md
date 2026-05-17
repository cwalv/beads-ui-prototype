# Explanation

Understanding-oriented essays. Read these when the shape of the system
isn't clicking — they explain *why* beads is structured the way it is,
which pieces are load-bearing, and where the abstractions leak.

## Contents

| Document | Summarizes |
|---|---|
| [why-beads.md](why-beads.md) | Design goals, what beads replaces, what problems it's shaped around. |
| [the-store-architecture.md](the-store-architecture.md) | Dolt, `issues` vs `wisps`, redirects, routing, how one server serves many rigs. |
| [the-pour-pipeline.md](the-pour-pipeline.md) | Formulas → protos → molecules / wisps. The "cook" pipeline. |
| [agent-coordination.md](agent-coordination.md) | Mail, nudges, gates, hooks, memory, prime — how beads supports multi-agent work. |
| [canonical-vs-vestigial.md](canonical-vs-vestigial.md) | What each orchestrator actually uses; what's dead code or doc-only. |
| [beads-and-orchestrators.md](beads-and-orchestrators.md) | The relationship. Why gastown exists; why gascity exists; what beads-ui is positioned for. |

These essays lean on the audit at [../../gaps-audit.md](../../gaps-audit.md)
for concrete findings about what's actually wired up.

# aggregations/

Reserved for shaping that *wants* to migrate to bd-core eventually:
graph walks, ready-set computation, rollups whose generality outgrows
any single orchestrator pack.

Empty in v1 (fo-0qdg9). Pack-local rollups (e.g. gascity's StatusRollup)
live under `packs/` because they're orchestrator-specific. Code under
this directory should be pack-agnostic and a candidate for upstreaming
into bd as bd's surface grows.

See `projects/foundations/docs/beads-ui/architecture-decisions.md` Decision 3.

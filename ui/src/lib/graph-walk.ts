import type { Bead, DepType } from '../types';

export interface RawEdge { from: string; to: string; type: DepType; }

export interface WalkResult { beads: Map<string, Bead | null>; edges: RawEdge[]; }

export async function walkMoleculeGraph(
  rootId: string,
  fetcher: (id: string) => Promise<Bead>,
  options: { maxDepth?: number; concurrency?: number } = {}
): Promise<WalkResult> {
  const { maxDepth = 3, concurrency = 16 } = options;
  const beads = new Map<string, Bead | null>();
  const edges: RawEdge[] = [];
  const edgeSet = new Set<string>();
  let frontier = [rootId];

  function addEdge(from: string, to: string, type: DepType) {
    const key = `${from}→${to}`;
    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from, to, type }); }
  }

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const toFetch = frontier.filter(id => !beads.has(id));
    for (let i = 0; i < toFetch.length; i += concurrency) {
      const batch = toFetch.slice(i, i + concurrency);
      const results = await Promise.allSettled(batch.map(id => fetcher(id)));
      results.forEach((r, bi) => {
        const id = batch[bi];
        if (r.status === 'fulfilled') beads.set(id, r.value);
        else beads.set(id, null);
      });
    }

    const nextFrontier = new Set<string>();
    for (const id of frontier) {
      const bead = beads.get(id);
      if (!bead) continue;
      for (const dep of bead.dependencies ?? []) {
        addEdge(dep.depends_on_id, id, dep.type);
        if (!beads.has(dep.depends_on_id)) nextFrontier.add(dep.depends_on_id);
      }
      for (const dep of bead.dependents ?? []) {
        addEdge(id, dep.issue_id, dep.type);
        if (!beads.has(dep.issue_id)) nextFrontier.add(dep.issue_id);
      }
    }
    frontier = [...nextFrontier];
  }
  for (const e of edges) {
    if (!beads.has(e.from)) beads.set(e.from, null);
    if (!beads.has(e.to)) beads.set(e.to, null);
  }
  return { beads, edges };
}

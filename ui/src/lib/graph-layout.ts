import type { Bead, LayoutNode, LayoutEdge, MoleculeGraph } from '../types';
import type { RawEdge } from './graph-walk';

const NODE_W = 220;
const NODE_H = 80;
const COL_GAP = 80;
const ROW_GAP = 28;
const PADDING = 20;

function edgePath(from: LayoutNode, to: LayoutNode): string {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const dx = Math.max((x2 - x1) * 0.5, 40);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2 - 4} ${y2}`;
}

export function layoutGraph(beads: Map<string, Bead | null>, rawEdges: RawEdge[]): MoleculeGraph {
  const ids = [...beads.keys()];

  const rankMap = new Map<string, number>();

  function getRank(id: string, visited: Set<string>): number {
    if (rankMap.has(id)) return rankMap.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const incomingEdges = rawEdges.filter(e => e.to === id);
    if (incomingEdges.length === 0) {
      rankMap.set(id, 0);
      return 0;
    }
    const maxParentRank = Math.max(...incomingEdges.map(e => getRank(e.from, new Set(visited))));
    const rank = maxParentRank + 1;
    rankMap.set(id, rank);
    return rank;
  }

  for (const id of ids) {
    getRank(id, new Set());
  }

  const byRank = new Map<number, string[]>();
  for (const id of ids) {
    const r = rankMap.get(id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  }

  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  const nodeMap = new Map<string, LayoutNode>();

  for (const rank of sortedRanks) {
    const col = ids.length === 0 ? [] : byRank.get(rank) ?? [];
    const x = PADDING + rank * (NODE_W + COL_GAP);
    col.forEach((id, rowIdx) => {
      const y = PADDING + rowIdx * (NODE_H + ROW_GAP);
      const bead = beads.get(id);
      const isGhost = bead === null || bead === undefined;
      const ghostBead: Bead = {
        id,
        title: id,
        status: 'open',
      };
      const actualBead = bead ?? ghostBead;

      const continuationGroup = actualBead.metadata?.['gc.continuation_group'] as string | undefined;

      const incomingEdgeIds = rawEdges.filter(e => e.to === id).map(e => e.from);
      const isReady = !isGhost &&
        actualBead.status === 'open' &&
        incomingEdgeIds.every(depId => {
          const depBead = beads.get(depId);
          return depBead !== null && depBead !== undefined && depBead.status === 'closed';
        });

      const node: LayoutNode = {
        id,
        bead: actualBead,
        x,
        y,
        w: NODE_W,
        h: NODE_H,
        isGhost,
        isReady,
        continuationGroup,
      };
      nodeMap.set(id, node);
    });
  }

  const layoutEdges: LayoutEdge[] = rawEdges
    .filter(e => nodeMap.has(e.from) && nodeMap.has(e.to))
    .map(e => ({
      from: e.from,
      to: e.to,
      type: e.type,
      path: edgePath(nodeMap.get(e.from)!, nodeMap.get(e.to)!),
    }));

  const nodes = [...nodeMap.values()];
  const totalW = nodes.length === 0 ? 0 : Math.max(...nodes.map(n => n.x + n.w)) + PADDING;
  const totalH = nodes.length === 0 ? 0 : Math.max(...nodes.map(n => n.y + n.h)) + PADDING;

  return { nodes, edges: layoutEdges, totalW, totalH };
}

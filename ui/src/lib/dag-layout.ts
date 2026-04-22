// DAG layout algorithm for formula steps.
// Produces positioned nodes and routed edges for SVG rendering.

import type { Step } from './formula-parse';

const NODE_W = 240;
const NODE_H_BASE = 72;
const COL_GAP = 72;
const ROW_GAP = 24;

export interface DAGNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DAGEdge {
  from: string;
  to: string;
}

export interface DAGLayout {
  nodes: Record<string, DAGNode>;
  edges: DAGEdge[];
  cols: (string[] | undefined)[];
  totalW: number;
  totalH: number;
}

export function layoutDAG(steps: Step[]): DAGLayout {
  const byId = Object.fromEntries(steps.filter(s => s.id).map(s => [s.id!, s]));
  const rank: Record<string, number> = {};

  function getRank(id: string, visiting = new Set<string>()): number {
    if (rank[id] !== undefined) return rank[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const s = byId[id];
    if (!s || !s.needs.length) { rank[id] = 0; return 0; }
    const r = Math.max(...s.needs.map(n => byId[n] ? getRank(n, visiting) + 1 : 0));
    rank[id] = r;
    visiting.delete(id);
    return r;
  }
  Object.keys(byId).forEach(id => getRank(id));

  const cols: (string[] | undefined)[] = [];
  Object.entries(rank).forEach(([id, r]) => {
    if (!cols[r]) cols[r] = [];
    cols[r]!.push(id);
  });

  const orderById = Object.fromEntries(steps.filter(s => s.id).map((s, i) => [s.id!, i]));
  cols.forEach(c => c && c.sort((a, b) => orderById[a] - orderById[b]));

  const heights: Record<string, number> = {};
  steps.forEach(s => {
    if (!s.id) return;
    const badges = (s.retry ? 1 : 0) + (s.metadata && Object.keys(s.metadata).length ? 1 : 0);
    heights[s.id] = NODE_H_BASE + (badges > 0 ? 26 : 0);
  });

  const nodes: Record<string, DAGNode> = {};
  cols.forEach((col, ci) => {
    if (!col) return;
    let y = 20;
    col.forEach(id => {
      nodes[id] = { x: 20 + ci * (NODE_W + COL_GAP), y, w: NODE_W, h: heights[id] ?? NODE_H_BASE };
      y += (heights[id] ?? NODE_H_BASE) + ROW_GAP;
    });
  });

  const colHeights = cols.map(col => {
    if (!col) return 0;
    return col.reduce((acc, id) => acc + (heights[id] ?? NODE_H_BASE) + ROW_GAP, 0) - ROW_GAP;
  });
  const maxColH = Math.max(...colHeights, 0);
  cols.forEach((col, ci) => {
    if (!col) return;
    const offset = Math.max(0, (maxColH - colHeights[ci]) / 2);
    col.forEach(id => { nodes[id].y += offset; });
  });

  const edges: DAGEdge[] = [];
  steps.forEach(s => {
    if (!s.id) return;
    s.needs.forEach(n => {
      if (nodes[n] && nodes[s.id!]) edges.push({ from: n, to: s.id! });
    });
  });

  const totalW = (cols.length || 1) * (NODE_W + COL_GAP) + 20;
  const totalH = maxColH + 40;

  return { nodes, edges, cols, totalW, totalH };
}

export function edgePath(from: DAGNode, to: DAGNode): string {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const dx = Math.max((x2 - x1) * 0.5, 32);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2 - 4} ${y2}`;
}

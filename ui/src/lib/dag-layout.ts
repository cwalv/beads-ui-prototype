// DAG layout algorithm for formula steps.
// Produces positioned nodes and routed edges for SVG rendering.

import dagre from 'dagre';
import type { Step } from './formula-parse';

export const NODE_W = 240;
const COL_GAP = 72;
const ROW_GAP = 24;

// Per-node height is estimated from title length (so longer step titles get
// taller cards instead of being clipped). Header band + per-line title height
// + padding + optional badge row.
const NODE_HEADER_H = 28;
const NODE_TITLE_LINE_H = 17;     // ~12px font * 1.4 line-height
const NODE_BOTTOM_PAD = 10;
const NODE_BADGE_H = 26;
const TITLE_CHARS_PER_LINE = 28;  // 240px - padding @ 12px monospace-ish ≈ 28 chars
const MAX_TITLE_LINES = 5;        // cap so a runaway title can't push everything sideways

function estimateTitleLines(title: string | null): number {
  if (!title) return 1;
  return Math.max(1, Math.min(MAX_TITLE_LINES, Math.ceil(title.length / TITLE_CHARS_PER_LINE)));
}

function estimateHeight(s: Step): number {
  const badges = (s.retry ? 1 : 0) + (s.metadata && Object.keys(s.metadata).length ? 1 : 0);
  const titleLines = estimateTitleLines(s.title);
  return NODE_HEADER_H + titleLines * NODE_TITLE_LINE_H + NODE_BOTTOM_PAD + (badges > 0 ? NODE_BADGE_H : 0);
}

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
  const validSteps = steps.filter(s => s.id);

  if (validSteps.length === 0) {
    return { nodes: {}, edges: [], cols: [], totalW: 0, totalH: 0 };
  }

  const heights: Record<string, number> = {};
  validSteps.forEach(s => { heights[s.id!] = estimateHeight(s); });

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: ROW_GAP, ranksep: COL_GAP, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  validSteps.forEach(s => {
    g.setNode(s.id!, { width: NODE_W, height: heights[s.id!] });
  });

  // Collect edges, skipping any that would create a cycle (best-effort safety).
  const edges: DAGEdge[] = [];
  validSteps.forEach(s => {
    s.needs.forEach(n => {
      if (heights[n] !== undefined) {
        g.setEdge(n, s.id!);
        edges.push({ from: n, to: s.id! });
      }
    });
  });

  try {
    dagre.layout(g);
  } catch {
    // Cycle or other layout error — fall back to empty positioning.
    return { nodes: {}, edges: [], cols: [], totalW: 0, totalH: 0 };
  }

  // Dagre returns center-based coordinates; convert to top-left.
  const nodes: Record<string, DAGNode> = {};
  g.nodes().forEach(id => {
    const n = g.node(id);
    nodes[id] = { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height };
  });

  const graphInfo = g.graph();
  const totalW = (graphInfo.width ?? 0) + 40;
  const totalH = (graphInfo.height ?? 0) + 40;

  // Derive cols from dagre ranks for interface compatibility (nothing consumes this).
  const rankMap: Record<number, string[]> = {};
  g.nodes().forEach(id => {
    const r = (g.node(id) as { rank?: number }).rank ?? 0;
    if (!rankMap[r]) rankMap[r] = [];
    rankMap[r].push(id);
  });
  const maxRank = Math.max(...Object.keys(rankMap).map(Number), -1);
  const cols: (string[] | undefined)[] = Array.from({ length: maxRank + 1 }, (_, i) => rankMap[i]);

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

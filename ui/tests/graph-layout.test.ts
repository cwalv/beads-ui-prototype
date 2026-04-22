import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../src/lib/graph-layout';
import type { Bead } from '../src/types';
import type { RawEdge } from '../src/lib/graph-walk';

function makeBead(id: string, overrides?: Partial<Bead>): Bead {
  return { id, title: `Bead ${id}`, status: 'open', ...overrides };
}

describe('layoutGraph', () => {
  it('single node: returned at position {x:20, y:20}', () => {
    const beads = new Map<string, Bead | null>([['A', makeBead('A')]]);
    const graph = layoutGraph(beads, []);
    expect(graph.nodes.length).toBe(1);
    expect(graph.nodes[0].x).toBe(20);
    expect(graph.nodes[0].y).toBe(20);
  });

  it('3-node chain A→B→C: B has rank 1, C has rank 2, positioned left-to-right', () => {
    const beads = new Map<string, Bead | null>([
      ['A', makeBead('A')],
      ['B', makeBead('B')],
      ['C', makeBead('C')],
    ]);
    const edges: RawEdge[] = [
      { from: 'A', to: 'B', type: 'tracks' },
      { from: 'B', to: 'C', type: 'tracks' },
    ];
    const graph = layoutGraph(beads, edges);

    const nodeA = graph.nodes.find(n => n.id === 'A')!;
    const nodeB = graph.nodes.find(n => n.id === 'B')!;
    const nodeC = graph.nodes.find(n => n.id === 'C')!;

    expect(nodeA.x).toBeLessThan(nodeB.x);
    expect(nodeB.x).toBeLessThan(nodeC.x);
    expect(graph.edges.length).toBe(2);
  });

  it('nodes without connections appear at rank 0', () => {
    const beads = new Map<string, Bead | null>([
      ['A', makeBead('A')],
      ['B', makeBead('B')],
    ]);
    const graph = layoutGraph(beads, []);
    expect(graph.nodes.every(n => n.x === 20)).toBe(true);
  });

  it('ghost nodes: included in layout with isGhost=true', () => {
    const beads = new Map<string, Bead | null>([
      ['A', makeBead('A')],
      ['B', null],
    ]);
    const edges: RawEdge[] = [{ from: 'A', to: 'B', type: 'tracks' }];
    const graph = layoutGraph(beads, edges);

    const ghostNode = graph.nodes.find(n => n.id === 'B');
    expect(ghostNode).toBeTruthy();
    expect(ghostNode!.isGhost).toBe(true);
  });

  it('ready nodes: node with status open and all deps closed → isReady=true', () => {
    const beads = new Map<string, Bead | null>([
      ['A', makeBead('A', { status: 'closed' })],
      ['B', makeBead('B', { status: 'open' })],
    ]);
    const edges: RawEdge[] = [{ from: 'A', to: 'B', type: 'tracks' }];
    const graph = layoutGraph(beads, edges);

    const nodeB = graph.nodes.find(n => n.id === 'B')!;
    expect(nodeB.isReady).toBe(true);
  });

  it('non-ready: node with status open but dep not closed → isReady=false', () => {
    const beads = new Map<string, Bead | null>([
      ['A', makeBead('A', { status: 'in_progress' })],
      ['B', makeBead('B', { status: 'open' })],
    ]);
    const edges: RawEdge[] = [{ from: 'A', to: 'B', type: 'tracks' }];
    const graph = layoutGraph(beads, edges);

    const nodeB = graph.nodes.find(n => n.id === 'B')!;
    expect(nodeB.isReady).toBe(false);
  });
});

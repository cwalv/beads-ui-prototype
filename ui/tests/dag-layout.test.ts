import { describe, it, expect } from 'vitest';
import { layoutDAG, edgePath } from '../src/lib/dag-layout';
import type { Step } from '../src/lib/formula-parse';

function step(id: string, needs: string[] = [], title = id): Step {
  return { id, needs, title, metadata: {}, retry: null };
}

describe('layoutDAG', () => {
  it('places a single root node', () => {
    const { nodes } = layoutDAG([step('a')]);
    expect(nodes.a).toBeDefined();
    expect(nodes.a.x).toBeGreaterThanOrEqual(0);
    expect(nodes.a.y).toBeGreaterThanOrEqual(0);
  });

  it('places dependent nodes further right than their parents', () => {
    const { nodes } = layoutDAG([step('a'), step('b', ['a'])]);
    expect(nodes.b.x).toBeGreaterThan(nodes.a.x);
  });

  it('preserves source order within a column (roots ordered by y)', () => {
    const steps = [step('a'), step('b'), step('c')];
    const { nodes } = layoutDAG(steps);
    // All roots — should be in same column, ordered a < b < c by y
    expect(nodes.a.y).toBeLessThan(nodes.b.y);
    expect(nodes.b.y).toBeLessThan(nodes.c.y);
  });

  it('produces edges for needs relationships', () => {
    const { edges } = layoutDAG([step('a'), step('b', ['a'])]);
    expect(edges).toContainEqual({ from: 'a', to: 'b' });
  });

  it('does not loop forever on a cycle', () => {
    const steps = [step('a', ['b']), step('b', ['a'])];
    expect(() => layoutDAG(steps)).not.toThrow();
  });

  it('returns sensible totalW and totalH', () => {
    const { totalW, totalH } = layoutDAG([step('a'), step('b', ['a'])]);
    expect(totalW).toBeGreaterThan(0);
    expect(totalH).toBeGreaterThan(0);
  });

  it('handles empty steps array', () => {
    const { nodes, edges } = layoutDAG([]);
    expect(Object.keys(nodes)).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('produces no node overlaps in a linear chain', () => {
    const steps = [step('a'), step('b', ['a']), step('c', ['b'])];
    const { nodes } = layoutDAG(steps);
    const nodeList = Object.values(nodes);
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const a = nodeList[i];
        const b = nodeList[j];
        const noOverlapX = a.x + a.w <= b.x || b.x + b.w <= a.x;
        const noOverlapY = a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(noOverlapX || noOverlapY).toBe(true);
      }
    }
  });

  it('places all needs edges with source left of destination', () => {
    const steps = [step('root'), step('mid', ['root']), step('leaf', ['mid'])];
    const { nodes, edges } = layoutDAG(steps);
    edges.forEach(({ from, to }) => {
      expect(nodes[from].x).toBeLessThan(nodes[to].x);
    });
  });

  it('total bounds are positive for multi-node graphs', () => {
    const steps = [step('a'), step('b', ['a']), step('c', ['a'])];
    const { totalW, totalH } = layoutDAG(steps);
    expect(totalW).toBeGreaterThan(0);
    expect(totalH).toBeGreaterThan(0);
  });
});

describe('edgePath', () => {
  it('produces a non-empty SVG path string', () => {
    const from = { x: 0, y: 0, w: 240, h: 72 };
    const to = { x: 400, y: 0, w: 240, h: 72 };
    const path = edgePath(from, to);
    expect(path).toMatch(/^M /);
    expect(path).toContain('C ');
  });
});

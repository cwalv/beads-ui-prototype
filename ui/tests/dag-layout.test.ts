import { describe, it, expect } from 'vitest';
import { layoutDAG, edgePath } from '../src/lib/dag-layout';
import type { Step } from '../src/lib/formula-parse';

function step(id: string, needs: string[] = []): Step {
  return { id, needs, title: id, metadata: {}, retry: null };
}

describe('layoutDAG', () => {
  it('places a single root node at column 0', () => {
    const { nodes } = layoutDAG([step('a')]);
    expect(nodes.a.x).toBe(20); // col 0
  });

  it('places dependent nodes in later columns', () => {
    const { nodes } = layoutDAG([step('a'), step('b', ['a'])]);
    expect(nodes.b.x).toBeGreaterThan(nodes.a.x);
  });

  it('preserves source order within a column', () => {
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

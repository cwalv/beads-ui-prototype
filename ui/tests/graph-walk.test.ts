import { describe, it, expect } from 'vitest';
import { walkMoleculeGraph } from '../src/lib/graph-walk';
import type { Bead } from '../src/types';

function makeBead(id: string, overrides?: Partial<Bead>): Bead {
  return { id, title: `Bead ${id}`, status: 'open', ...overrides };
}

describe('walkMoleculeGraph', () => {
  it('happy path: root with 2 deps returns 3 nodes and 2 edges', async () => {
    const beadA = makeBead('A', {
      dependencies: [
        { depends_on_id: 'B', type: 'tracks' },
        { depends_on_id: 'C', type: 'blocks' },
      ],
    });
    const beadB = makeBead('B');
    const beadC = makeBead('C');

    const fetcher = async (id: string) => {
      if (id === 'A') return beadA;
      if (id === 'B') return beadB;
      if (id === 'C') return beadC;
      throw new Error(`not found: ${id}`);
    };

    const result = await walkMoleculeGraph('A', fetcher, { maxDepth: 3 });
    expect(result.beads.size).toBe(3);
    expect(result.edges.length).toBe(2);
    expect(result.edges.find(e => e.from === 'B' && e.to === 'A')).toBeTruthy();
    expect(result.edges.find(e => e.from === 'C' && e.to === 'A')).toBeTruthy();
  });

  it('deduplication: same id referenced from multiple paths is only fetched once', async () => {
    let fetchCount = 0;
    const beadA = makeBead('A', {
      dependencies: [{ depends_on_id: 'B', type: 'tracks' }],
      dependents: [{ issue_id: 'B', type: 'related' }],
    });
    const beadB = makeBead('B');

    const fetcher = async (id: string) => {
      fetchCount++;
      if (id === 'A') return beadA;
      if (id === 'B') return beadB;
      throw new Error(`not found: ${id}`);
    };

    await walkMoleculeGraph('A', fetcher, { maxDepth: 3 });
    expect(fetchCount).toBe(2);
  });

  it('depth cap: at maxDepth=1, stops before fetching second-hop nodes', async () => {
    const beadA = makeBead('A', {
      dependencies: [{ depends_on_id: 'B', type: 'tracks' }],
    });
    const beadB = makeBead('B', {
      dependencies: [{ depends_on_id: 'C', type: 'tracks' }],
    });
    const beadC = makeBead('C');

    const fetcher = async (id: string) => {
      if (id === 'A') return beadA;
      if (id === 'B') return beadB;
      if (id === 'C') return beadC;
      throw new Error(`not found: ${id}`);
    };

    // maxDepth=1 means: fetch root (depth 0) + direct neighbors (depth 1). C is at depth 2 so not fetched.
    const result = await walkMoleculeGraph('A', fetcher, { maxDepth: 1 });
    expect(result.beads.has('A')).toBe(true);
    expect(result.beads.has('B')).toBe(true);
    expect(result.beads.has('C')).toBe(false);
  });

  it('ghost node: fetcher throws for one id → bead is null', async () => {
    const beadA = makeBead('A', {
      dependencies: [{ depends_on_id: 'B', type: 'tracks' }],
    });

    const fetcher = async (id: string) => {
      if (id === 'A') return beadA;
      throw new Error('not found');
    };

    const result = await walkMoleculeGraph('A', fetcher, { maxDepth: 2 });
    expect(result.beads.get('A')).not.toBeNull();
    expect(result.beads.get('B')).toBeNull();
  });

  it('cycle guard: A depends on B, B depends on A → no infinite loop', async () => {
    const beadA = makeBead('A', {
      dependencies: [{ depends_on_id: 'B', type: 'tracks' }],
    });
    const beadB = makeBead('B', {
      dependencies: [{ depends_on_id: 'A', type: 'tracks' }],
    });

    const fetcher = async (id: string) => {
      if (id === 'A') return beadA;
      if (id === 'B') return beadB;
      throw new Error('not found');
    };

    const result = await walkMoleculeGraph('A', fetcher, { maxDepth: 5 });
    expect(result.beads.has('A')).toBe(true);
    expect(result.beads.has('B')).toBe(true);
    expect(result.edges.length).toBeLessThanOrEqual(2);
  });
});

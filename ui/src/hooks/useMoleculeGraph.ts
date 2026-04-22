import { useState, useEffect, useCallback } from 'react';
import type { MoleculeGraph } from '../types';
import { walkMoleculeGraph } from '../lib/graph-walk';
import { layoutGraph } from '../lib/graph-layout';
import { getBead } from '../client/bead';

type State = { graph: MoleculeGraph | null; loading: boolean; error: string | null; };

export function useMoleculeGraph(moleculeId: string, depth = 3) {
  const [state, setState] = useState<State>({ graph: null, loading: true, error: null });

  const load = useCallback(async () => {
    if (!moleculeId) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const { beads, edges } = await walkMoleculeGraph(moleculeId, getBead, { maxDepth: depth });
      const graph = layoutGraph(beads, edges);
      setState({ graph, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ graph: null, loading: false, error: msg });
    }
  }, [moleculeId, depth]);

  useEffect(() => { load(); }, [load]);

  const patchNode = useCallback((id: string, patch: Partial<{ title: string; status: string; priority: number }>) => {
    setState(s => {
      if (!s.graph) return s;
      return {
        ...s,
        graph: {
          ...s.graph,
          nodes: s.graph.nodes.map(n =>
            n.id === id ? { ...n, bead: { ...n.bead, ...patch } as typeof n.bead } : n
          ),
        },
      };
    });
  }, []);

  return { ...state, refresh: load, patchNode };
}

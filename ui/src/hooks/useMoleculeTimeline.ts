import { useState, useEffect, useCallback, useRef } from 'react';
import type { MoleculeEvent, PackContext } from '../conventions/types';
import { getActivePack } from '../conventions';
import { bdClient } from '../client/bd';

type State = { events: MoleculeEvent[]; loading: boolean; error: string | null };

export function useMoleculeTimeline(moleculeId: string, workspace: string | null) {
  const [state, setState] = useState<State>({ events: [], loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!moleculeId || !workspace) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState(s => ({ ...s, loading: true, error: null }));
    const ctx: PackContext = { driver: bdClient, workspace, signal: ac.signal };
    try {
      const events = await getActivePack().getMoleculeEvents(moleculeId, ctx);
      if (!ac.signal.aborted) setState({ events, loading: false, error: null });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : String(e);
      if (!ac.signal.aborted) setState({ events: [], loading: false, error: msg });
    }
  }, [moleculeId, workspace]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  return { ...state, refresh: load };
}

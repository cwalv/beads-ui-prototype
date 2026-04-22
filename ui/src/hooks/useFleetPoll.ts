import { useState, useEffect, useRef, useCallback } from 'react';
import { listLiveMolecules, type FleetMolecule } from '../client/fleet';

const DEFAULT_INTERVAL_MS =
  Number(import.meta.env.VITE_FLEET_POLL_INTERVAL_MS) ||
  Number(localStorage.getItem('beads-ui.fleet.pollIntervalMs')) ||
  3000;

const HIDDEN_INTERVAL_MS = 10_000;
const BACKOFF_STEPS = [3_000, 6_000, 12_000, 30_000];

export type PauseReason = 'tab-hidden' | 'error-backoff' | null;

export interface FleetPollState {
  molecules: FleetMolecule[];
  loading: boolean;
  error: string | null;
  lastTickAt: number | null;
  pauseReason: PauseReason;
  retryIn: number | null;
  unreachableWorkspaces: string[];
}

export function useFleetPoll(workspaceNames: string[]) {
  const [state, setState] = useState<FleetPollState>({
    molecules: [],
    loading: true,
    error: null,
    lastTickAt: null,
    pauseReason: null,
    retryIn: null,
    unreachableWorkspaces: [],
  });

  const moleculesRef = useRef<FleetMolecule[]>([]);
  const inFlightRef = useRef(false);
  const backoffIdxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsNamesRef = useRef(workspaceNames);
  wsNamesRef.current = workspaceNames;

  const scheduleTick = useCallback((delayMs: number) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => tick(), delayMs);
  }, []);

  const tick = useCallback(async () => {
    if (inFlightRef.current) return;
    if (document.hidden) {
      setState(s => ({ ...s, pauseReason: 'tab-hidden', retryIn: null }));
      return;
    }
    if (!wsNamesRef.current.length) return;

    inFlightRef.current = true;
    const controller = new AbortController();
    try {
      const { molecules, unreachableWorkspaces } = await listLiveMolecules(
        wsNamesRef.current,
        moleculesRef.current,
        controller.signal,
      );
      moleculesRef.current = molecules;
      backoffIdxRef.current = 0;
      setState(s => ({
        ...s,
        molecules,
        loading: false,
        error: null,
        lastTickAt: Date.now(),
        pauseReason: null,
        retryIn: null,
        unreachableWorkspaces,
      }));
      scheduleTick(
        document.hidden ? HIDDEN_INTERVAL_MS : DEFAULT_INTERVAL_MS,
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const idx = Math.min(backoffIdxRef.current, BACKOFF_STEPS.length - 1);
      const delay = BACKOFF_STEPS[idx];
      backoffIdxRef.current = Math.min(backoffIdxRef.current + 1, BACKOFF_STEPS.length - 1);
      const msg = e instanceof Error ? e.message : String(e);
      setState(s => ({
        ...s,
        loading: false,
        error: msg,
        pauseReason: 'error-backoff',
        retryIn: Math.round(delay / 1000),
      }));
      scheduleTick(delay);
    } finally {
      inFlightRef.current = false;
    }
  }, [scheduleTick]);

  // Visibility gating: pause on hidden, fire immediately on visible
  useEffect(() => {
    function onVisibility() {
      if (!document.hidden) {
        setState(s => ({ ...s, pauseReason: null }));
        tick();
      } else {
        setState(s => ({ ...s, pauseReason: 'tab-hidden' }));
        if (timerRef.current !== null) clearTimeout(timerRef.current);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [tick]);

  // Start polling on mount; cancel on unmount
  useEffect(() => {
    tick();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [tick]);

  return state;
}

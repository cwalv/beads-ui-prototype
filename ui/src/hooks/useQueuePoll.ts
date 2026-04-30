import { useState, useEffect, useRef, useCallback } from 'react';
import { listQueueBeads, type QueueLens } from '../client/queue';
import type { Bead } from '../types';

const DEFAULT_INTERVAL_MS =
  Number(import.meta.env.VITE_QUEUE_POLL_INTERVAL_MS) ||
  Number(localStorage.getItem('beads-ui.queue.pollIntervalMs')) ||
  5000;

const HIDDEN_INTERVAL_MS = 15_000;
const BACKOFF_STEPS = [3_000, 6_000, 12_000, 30_000];

export type PauseReason = 'tab-hidden' | 'error-backoff' | null;

export interface QueuePollState {
  beads: Bead[];
  loading: boolean;
  error: string | null;
  lastTickAt: number | null;
  pauseReason: PauseReason;
  retryIn: number | null;
}

export function useQueuePoll(workspace: string | null, lens: QueueLens) {
  const [state, setState] = useState<QueuePollState>({
    beads: [],
    loading: true,
    error: null,
    lastTickAt: null,
    pauseReason: null,
    retryIn: null,
  });

  const inFlightRef = useRef(false);
  const backoffIdxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef(workspace);
  const lensRef = useRef(lens);
  wsRef.current = workspace;
  lensRef.current = lens;

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
    if (!wsRef.current) return;

    inFlightRef.current = true;
    const controller = new AbortController();
    try {
      const { beads } = await listQueueBeads(wsRef.current, lensRef.current, controller.signal);
      backoffIdxRef.current = 0;
      setState(s => ({
        ...s,
        beads,
        loading: false,
        error: null,
        lastTickAt: Date.now(),
        pauseReason: null,
        retryIn: null,
      }));
      scheduleTick(document.hidden ? HIDDEN_INTERVAL_MS : DEFAULT_INTERVAL_MS);
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

  // Re-fetch on workspace / lens change
  useEffect(() => {
    setState(s => ({ ...s, loading: true }));
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, lens]);

  // Visibility gating
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  return { ...state, refresh: tick };
}

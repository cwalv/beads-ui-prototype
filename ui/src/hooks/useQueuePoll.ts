import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listQueueBeads, type QueueLens } from '../client/queue';
import type { Bead } from '../types';

const QUEUE_POLL_INTERVAL_MS = 5000;

export type PauseReason = 'tab-hidden' | 'error-backoff' | null;

export interface QueuePollState {
  beads: Bead[];
  loading: boolean;
  error: string | null;
  lastTickAt: number | null;
  pauseReason: PauseReason;
  retryIn: number | null;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() =>
    typeof document !== 'undefined' && document.hidden,
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}

export function useQueuePoll(workspace: string | null, lens: QueueLens) {
  const isHidden = useDocumentHidden();

  const query = useQuery({
    queryKey: ['queue', workspace, lens] as const,
    queryFn: async ({ signal }) => {
      const { beads } = await listQueueBeads(workspace!, lens, signal);
      return beads;
    },
    enabled: workspace !== null,
    refetchInterval: QUEUE_POLL_INTERVAL_MS,
  });

  const error = query.error
    ? query.error instanceof Error ? query.error.message : String(query.error)
    : null;

  let pauseReason: PauseReason = null;
  let retryIn: number | null = null;
  if (isHidden) {
    pauseReason = 'tab-hidden';
  } else if (error && query.fetchStatus === 'idle') {
    pauseReason = 'error-backoff';
    retryIn = Math.round(QUEUE_POLL_INTERVAL_MS / 1000);
  }

  return {
    beads: query.data ?? [],
    loading: query.isLoading,
    error,
    lastTickAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
    pauseReason,
    retryIn,
    refresh: async () => { await query.refetch(); },
  };
}

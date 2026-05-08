import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listLiveMolecules, type FleetMolecule, type WorkspaceError } from '../client/fleet';
import { getActivePack } from '../conventions';

const FLEET_POLL_INTERVAL_MS = 3000;

export type PauseReason = 'tab-hidden' | 'error-backoff' | null;

export interface FleetPollState {
  molecules: FleetMolecule[];
  loading: boolean;
  error: string | null;
  lastTickAt: number | null;
  pauseReason: PauseReason;
  retryIn: number | null;
  workspaceErrors: WorkspaceError[];
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

export function useFleetPoll(workspaceNames: string[]): FleetPollState {
  const isHidden = useDocumentHidden();
  const packName = getActivePack().name;

  const query = useQuery({
    queryKey: ['fleet', workspaceNames, packName] as const,
    queryFn: ({ signal }) => listLiveMolecules(workspaceNames, [], signal),
    enabled: workspaceNames.length > 0,
    refetchInterval: FLEET_POLL_INTERVAL_MS,
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
    retryIn = Math.round(FLEET_POLL_INTERVAL_MS / 1000);
  }

  return {
    molecules: query.data?.molecules ?? [],
    loading: query.isLoading,
    error,
    lastTickAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
    pauseReason,
    retryIn,
    workspaceErrors: query.data?.workspaceErrors ?? [],
  };
}

import { createContext, useContext } from 'react';
import type { Workspace } from '../types';

export interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  error: string | null;
  isStub: boolean;
  isConsolidated: boolean;
  setCurrent: (name: string) => void;
  setConsolidated: (on: boolean) => void;
  retry: () => void;
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}

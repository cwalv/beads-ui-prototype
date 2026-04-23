import { createContext, useContext } from 'react';
import type { Workspace } from '../types';

export interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  error: string | null;
  isStub: boolean;
  isConsolidated: boolean; // TODO fo-zz4pz §10: consolidated mode merges results across workspaces — most surfaces don't yet implement the multi-db query
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

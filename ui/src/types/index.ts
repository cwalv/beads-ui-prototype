export type Destination = 'author' | 'observe' | 'capture';

export interface Workspace {
  name: string;
  path: string;
  description?: string;
  color?: string;
}

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

export type BeadStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed';
export type BeadType = 'bug' | 'feature' | 'task' | 'epic' | 'chore' | 'message' | 'merge-request' | 'molecule' | 'gate' | 'agent' | 'role' | 'convoy';

export interface BdError {
  kind: 'network' | 'server' | 'parse';
  message: string;
  status?: number;
}

export interface BdResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: BdError;
}

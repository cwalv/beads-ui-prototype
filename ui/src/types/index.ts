export type Destination = 'author' | 'observe' | 'capture' | 'docs';

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

export type DepType = 'tracks' | 'blocks' | 'parent-child' | 'waits-for' | 'conditional-blocks' | 'related' | 'discovered-from';

export interface BeadDependency { depends_on_id: string; type: DepType; }
export interface BeadDependent { issue_id: string; type: DepType; }
export interface BeadComment { id: string; body: string; author?: string; created_at?: string; }
export interface BeadEvent { id: string; kind: string; message?: string; author?: string; created_at?: string; }

export interface Bead {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  status: BeadStatus;
  type?: BeadType;
  priority?: number;
  assignee?: string;
  labels?: string[];
  external_ref?: string;
  metadata?: Record<string, unknown>;
  dependencies?: BeadDependency[];
  dependents?: BeadDependent[];
  comments?: BeadComment[];
  events?: BeadEvent[];
  created_at?: string;
  updated_at?: string;
}

export interface LayoutNode {
  id: string;
  bead: Bead;
  x: number; y: number; w: number; h: number;
  isGhost?: boolean;
  isReady?: boolean;
  continuationGroup?: string;
}

export interface LayoutEdge {
  from: string; to: string;
  type: DepType;
  path: string;
}

export interface MoleculeGraph {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  totalW: number;
  totalH: number;
}

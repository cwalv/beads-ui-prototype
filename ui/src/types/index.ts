// UI-facing type surface. Proto-defined messages re-exported under the
// names the rest of the codebase already uses; UI-only types defined
// inline below.
//
// The proto schema (`proto/beads/v1/`) is the canonical bd interface
// contract. JSON wire types (`*Json`) match bd-server's snake_case wire
// format directly via per-field `[json_name = ...]` annotations, so cast
// from `fetch().json()` is sound without a translation layer.
//
// See projects/foundations/docs/beads-ui/architecture-decisions.md
// (Decision 1) for the rationale.

import type {
  BeadJson,
  CommentJson,
  DependencyJson,
  EventJson,
  WorkspaceJson,
} from '../gen/beads/v1/types_pb.js';
import type {
  FormulaEntryJson,
  FormulaSchemaFieldJson,
  FormulaSchemaJson,
} from '../gen/beads/v1/formula_pb.js';

// ===== Proto-backed types =====
//
// protojson treats every proto3 field as optional in JSON since absent
// fields receive proto's default values on the wire. bd's actual
// behavior populates a small set of fields on every row (id, title,
// status, priority, type, created_at, updated_at). The aliases below
// assert that contract for UI ergonomics; runtime parsing should still
// guard against malformed responses.

export type Bead = Omit<
  BeadJson,
  | 'id'
  | 'title'
  | 'status'
  | 'priority'
  | 'type'
  | 'created_at'
  | 'updated_at'
  | 'dependencies'
  | 'dependents'
  | 'comments'
> & {
  id: string;
  title: string;
  status: string;
  priority: number;
  type: string;
  created_at: NonNullable<BeadJson['created_at']>;
  updated_at: NonNullable<BeadJson['updated_at']>;
  // bd show populates dependencies / dependents as full nested beads
  // tagged with `dependency_type`. Comments are full Comment rows.
  dependencies?: Bead[];
  dependents?: Bead[];
  comments?: Comment[];
  // UI-side extension: proto Bead does not include event-table rows in v1
  // (bd-server's `bd show --json` does not populate them). The field is
  // kept here so the events tab can render once a future bd-server
  // surface attaches them. Always `undefined` against the current wire.
  events?: Event[];
};

export type Comment = Omit<CommentJson, 'id' | 'issue_id' | 'author' | 'text' | 'created_at'> & {
  id: string;
  issue_id: string;
  author: string;
  text: string;
  created_at: NonNullable<CommentJson['created_at']>;
};

export type Dependency = DependencyJson;
export type Event = EventJson;
export type Workspace = Omit<WorkspaceJson, 'name' | 'path' | 'reachable'> & {
  name: string;
  path: string;
  reachable: boolean;
};
export type FormulaSchema = FormulaSchemaJson;
export type FormulaSchemaField = FormulaSchemaFieldJson;
export type FormulaEntry = FormulaEntryJson;

// ===== UI / transport-only types =====

export type Destination = 'author' | 'observe' | 'capture' | 'docs';

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

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

// ===== Canonical value tables (string narrowings) =====
//
// The proto exposes status / type / dep_type as bare `string` because bd
// supports user-defined customs. UI components that switch on known values
// narrow to these unions; unknown values pass through with neutral render.

export type BeadStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'deferred'
  | 'closed'
  | 'pinned'
  | 'hooked';

export type BeadType =
  | 'bug'
  | 'feature'
  | 'task'
  | 'epic'
  | 'chore'
  | 'decision'
  | 'message'
  | 'molecule'
  | 'spike'
  | 'story'
  | 'milestone'
  | 'event'
  // Removed-from-built-in but commonly seen as customs:
  | 'gate'
  | 'convoy'
  | 'merge-request'
  | 'slot'
  | 'agent'
  | 'role'
  | 'rig';

export type DepType =
  // Workflow (affect ready-work calc)
  | 'blocks'
  | 'parent-child'
  | 'conditional-blocks'
  | 'waits-for'
  // Association
  | 'related'
  | 'discovered-from'
  // Graph link
  | 'replies-to'
  | 'relates-to'
  | 'duplicates'
  | 'supersedes'
  // Entity
  | 'authored-by'
  | 'assigned-to'
  | 'approved-by'
  | 'attests'
  // Convoy / cross-project
  | 'tracks'
  // Reference
  | 'until'
  | 'caused-by'
  | 'validates'
  // Delegation
  | 'delegated-from';

// ===== Layout types (UI-side molecule graph rendering) =====

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

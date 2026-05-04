// Convention layer types — abstract shapes shared by all orchestrator packs.
//
// Per architecture-decisions.md Decision 3: bd is generic; orchestrators
// (gascity, gastown, bare) layer conventions on top via metadata, labels,
// or description-fields. A pack translates raw beads into UI-shaped
// FleetItems so that UI components don't need to know which orchestrator
// produced them.

import type { Bead, Workspace } from '../types';

export type BadgeTone = 'info' | 'warn' | 'error' | 'neutral';

export interface Badge {
  label: string;
  tone: BadgeTone;
}

// Pack-emitted shape for Fleet (active-units-of-work) rendering. Each pack
// defines what its "active units" are: gascity = molecules; bare =
// molecules; gastown = polecats + rigs + merge-slots.
export interface FleetItem {
  id: string;
  title: string;
  primaryLabel: string;       // pack-emitted display string ('◐ running', '↻ retry 2/3', etc.)
  primaryTone: BadgeTone;
  progress: number | null;    // 0..1, or null when "progress" is not meaningful
  badges: Badge[];
  createdAt: string;
  updatedAt: string;
  packData: unknown;          // pack-specific drill-in data (see GascityFleetData et al.)
}

// Map from a step's metadata to a chip rendered alongside the step.
// Pack-specific because gc.* / gt:* / etc. are pack conventions.
export interface BadgeRule {
  conceptKey: string;                                       // for HintDot popovers
  apply(metadata: Record<string, unknown>): Badge | null;
}

// Friendly labels for known metadata keys. Used by Issue peek and other
// surfaces that render raw metadata key/value tables.
export interface KeyDisplay {
  label: string;
  description?: string;
}
export type KeyDisplayMap = Record<string, KeyDisplay>;

// Driver shape — matches the existing bdClient. Kept here so packs don't
// import from src/client/ directly (preserves the layer boundary).
export interface PackDriver {
  fetch<T>(args: string[], opts?: { workspace?: string; signal?: AbortSignal }): Promise<T>;
}

export interface PackContext {
  driver: PackDriver;
  workspace: string;
  signal?: AbortSignal;
  // Cache from the previous tick. Pack may reuse entries whose
  // updatedAt matches the current source bead, skipping detail fetches.
  prev?: FleetItem[];
}

export type WorkspaceInfo = Workspace;

// Lightweight summary used by formula-instances surfaces. Not a FleetItem
// because the formula-instances row needs less than Fleet (no progress,
// no badges) and lives in a different UI surface.
export interface FormulaInstanceItem {
  id: string;
  title: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

// Pack-emitted event shape for Timeline view. Distinct from the proto
// EventJson (audit-trail rows in bd's events table) — this covers both
// bd lifecycle events and orchestrator-specific events (.gc/events.jsonl,
// gastown logs, etc.) in a unified shape.
export type EventTone = 'info' | 'warn' | 'error';

export interface MoleculeEvent {
  timestamp: string;                       // ISO 8601
  type: string;                            // 'bead.created' | 'bead.started' | 'bead.closed' | 'comment.added' | 'gc.retry' | …
  source: string;                          // 'bd' | 'gascity' | 'gastown' | …
  beadId?: string;
  payload: Record<string, unknown>;
  display: { label: string; icon?: string; tone?: EventTone };
}

export interface OrchestratorPack {
  name: string;
  detect(workspace: WorkspaceInfo): boolean;

  capabilities: {
    moleculeGraph: boolean;       // does the per-molecule Graph view apply?
    formulaInstances: boolean;    // can this pack list molecules poured from a formula?
  };

  // Fleet — every pack provides discovery + transformation.
  listFleetItems(ctx: PackContext): Promise<FleetItem[]>;

  // Optional: list molecules instantiated from a given formula. Only
  // implemented when capabilities.formulaInstances is true.
  listInstancesByFormula?(ctx: PackContext, formulaName: string): Promise<FormulaInstanceItem[]>;

  // Timeline events for a molecule. Default impl synthesizes from bd
  // lifecycle (created/started/closed timestamps) and comments. Packs
  // with richer event sources (e.g. gascity .gc/events.jsonl) augment.
  getMoleculeEvents(rootId: string, ctx: PackContext): Promise<MoleculeEvent[]>;

  // Display rules
  badgeRules: BadgeRule[];
  metadataDisplay: KeyDisplayMap;
}

// Re-exported for packs that need to type-narrow against bead shape.
export type { Bead };

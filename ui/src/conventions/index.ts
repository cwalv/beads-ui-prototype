// Convention layer entry point. UI code consumes from here, not from
// individual packs/ files, so the pack registry can grow without
// changing call sites.

import type { OrchestratorPack, WorkspaceInfo } from './types';
import { gascityPack } from './packs/gascity';

export * from './types';
export { gascityPack };
export type { GascityFleetData, MoleculeAgg, StatusRollup } from './packs/gascity';
export { computeAgg } from './packs/gascity';

// Pack registry. Order matters once detection is real: first match wins.
// v1 ships gascity only; bare-bd and gastown are deferred (see fo-0qdg9).
const PACKS: OrchestratorPack[] = [gascityPack];

// Returns the active pack for a workspace. v1 always resolves to gascity;
// when bd-server's Workspace.pack proto field lands the dispatch happens
// here against `workspace.pack`.
export function getActivePack(_workspace?: WorkspaceInfo): OrchestratorPack {
  return PACKS[0];
}

export function getAllPacks(): readonly OrchestratorPack[] {
  return PACKS;
}

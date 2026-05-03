import { bdClient } from './bd';
import { getActivePack } from '../conventions';
import type { FleetItem, GascityFleetData, MoleculeAgg } from '../conventions';

// FleetMolecule is the gascity-shaped row used by the Fleet UI in v1.
// The pack returns abstract FleetItem; this layer narrows packData into
// the gascity MoleculeAgg shape that FleetRow / FleetSummary already
// know how to render. When a non-gascity pack lands, this file grows
// per-pack adapters or the Fleet UI moves onto FleetItem directly.
export interface FleetMolecule {
  id: string;
  title: string;
  workspace: string;
  agg: MoleculeAgg;
  createdAt: string;
  updatedAt: string;
}

export interface FleetResult {
  molecules: FleetMolecule[];
  unreachableWorkspaces: string[];
}

function toMolecule(item: FleetItem, workspace: string): FleetMolecule {
  const { agg } = item.packData as GascityFleetData;
  return {
    id: item.id,
    title: item.title,
    workspace,
    agg,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// Per-workspace cache of the previous tick's FleetItems, keyed by workspace
// name. Maintained internally so useFleetPoll's FleetMolecule[] state can
// stay UI-shaped while still letting the pack reuse unchanged details.
const fleetItemCache = new Map<string, FleetItem[]>();

export async function listLiveMolecules(
  workspaceNames: string[],
  _prev: FleetMolecule[],
  signal: AbortSignal,
): Promise<FleetResult> {
  const pack = getActivePack();

  const wsResults = await Promise.allSettled(
    workspaceNames.map(ws =>
      pack.listFleetItems({
        driver: bdClient,
        workspace: ws,
        signal,
        prev: fleetItemCache.get(ws),
      }),
    ),
  );

  const unreachableWorkspaces: string[] = [];
  const molecules: FleetMolecule[] = [];

  wsResults.forEach((r, i) => {
    const ws = workspaceNames[i];
    if (r.status === 'fulfilled') {
      fleetItemCache.set(ws, r.value);
      for (const item of r.value) molecules.push(toMolecule(item, ws));
    } else {
      unreachableWorkspaces.push(ws);
    }
  });

  // Drop cache entries for workspaces no longer in the active set.
  for (const ws of fleetItemCache.keys()) {
    if (!workspaceNames.includes(ws)) fleetItemCache.delete(ws);
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  return { molecules, unreachableWorkspaces };
}

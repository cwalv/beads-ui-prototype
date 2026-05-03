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

export async function listLiveMolecules(
  workspaceNames: string[],
  prev: FleetMolecule[],
  signal: AbortSignal,
): Promise<FleetResult> {
  const pack = getActivePack();

  // Group prev cache by workspace so each pack call sees only its own
  // workspace's prior items.
  const prevByWs = new Map<string, FleetItem[]>();
  for (const m of prev) {
    const arr = prevByWs.get(m.workspace) ?? [];
    arr.push({
      id: m.id,
      title: m.title,
      primaryLabel: '',
      primaryTone: 'info',
      progress: m.agg.progress,
      badges: [],
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      packData: { agg: m.agg } satisfies GascityFleetData,
    });
    prevByWs.set(m.workspace, arr);
  }

  const wsResults = await Promise.allSettled(
    workspaceNames.map(ws =>
      pack.listFleetItems({
        driver: bdClient,
        workspace: ws,
        signal,
        prev: prevByWs.get(ws),
      }),
    ),
  );

  const unreachableWorkspaces: string[] = [];
  const molecules: FleetMolecule[] = [];

  wsResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const item of r.value) molecules.push(toMolecule(item, workspaceNames[i]));
    } else {
      unreachableWorkspaces.push(workspaceNames[i]);
    }
  });

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  return { molecules, unreachableWorkspaces };
}

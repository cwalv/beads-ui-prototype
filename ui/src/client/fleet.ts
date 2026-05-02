import { bdClient } from './bd';
import type { Bead } from '../types';
import { computeAgg, type MoleculeAgg } from '../lib/molecule-agg';

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

async function listMoleculeRoots(workspace: string, signal: AbortSignal): Promise<Bead[]> {
  return bdClient.fetch<Bead[]>(
    ['list', '--type=molecule', '--status=in_progress', '--json'],
    { signal, workspace },
  );
}

async function fetchMoleculeDetail(
  id: string,
  signal: AbortSignal,
): Promise<{ root: Bead; children: Bead[] }> {
  const root = await bdClient.fetch<Bead>(['show', id, '--json'], { signal });
  const childIds = (root.dependencies ?? []).map(d => d.id);
  const children = await Promise.all(
    childIds.map(cid => bdClient.fetch<Bead>(['show', cid, '--json'], { signal })),
  );
  return { root, children };
}

export async function listLiveMolecules(
  workspaceNames: string[],
  prev: FleetMolecule[],
  signal: AbortSignal,
): Promise<FleetResult> {
  // Fan out one query per workspace in parallel
  const wsResults = await Promise.allSettled(
    workspaceNames.map(ws => listMoleculeRoots(ws, signal)),
  );

  const unreachableWorkspaces: string[] = [];
  const allRoots: Array<{ root: Bead; workspace: string }> = [];

  wsResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const bead of r.value) allRoots.push({ root: bead, workspace: workspaceNames[i] });
    } else {
      unreachableWorkspaces.push(workspaceNames[i]);
    }
  });

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const prevById = new Map(prev.map(m => [m.id, m]));

  const molecules = await Promise.all(
    allRoots.map(async ({ root, workspace }): Promise<FleetMolecule> => {
      const existing = prevById.get(root.id);
      // Reuse agg if molecule hasn't changed since last tick
      if (existing && existing.updatedAt === (root.updated_at ?? '')) {
        return { ...existing, workspace };
      }
      try {
        const { root: fullRoot, children } = await fetchMoleculeDetail(root.id, signal);
        return {
          id: fullRoot.id,
          title: fullRoot.title,
          workspace,
          agg: computeAgg(fullRoot, children),
          createdAt: fullRoot.created_at ?? '',
          updatedAt: fullRoot.updated_at ?? '',
        };
      } catch {
        // Partial failure: render with minimal agg rather than dropping the row
        return {
          id: root.id,
          title: root.title,
          workspace,
          agg: computeAgg(root, []),
          createdAt: root.created_at ?? '',
          updatedAt: root.updated_at ?? '',
        };
      }
    }),
  );

  return { molecules, unreachableWorkspaces };
}

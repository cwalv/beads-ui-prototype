import type { Workspace } from '../types';
import stubData from './stubs/stub-workspaces.json';

const BASE_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

let warnedStub = false;

export async function fetchWorkspaces(): Promise<Workspace[]> {
  if (!BASE_URL) {
    if (!warnedStub) {
      console.warn('[beads-ui] VITE_BD_SERVER_URL not set — using stub workspace list');
      warnedStub = true;
    }
    return stubData.workspaces as Workspace[];
  }

  const res = await fetch(`${BASE_URL}/workspaces`);
  if (!res.ok) {
    throw new Error(`GET /workspaces failed: ${res.status}`);
  }
  const body = (await res.json()) as { workspaces: Workspace[] };
  return body.workspaces;
}

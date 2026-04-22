import type { BdError } from '../types';

const BASE_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

export interface BdFetchOptions {
  signal?: AbortSignal;
  workspace?: string;
}

async function bdFetch<T>(args: string[], opts: BdFetchOptions = {}): Promise<T> {
  if (!BASE_URL) {
    throw { kind: 'network', message: 'bd-server not configured (VITE_BD_SERVER_URL unset)' } satisfies BdError;
  }

  const body: Record<string, unknown> = { args };
  if (opts.workspace) body.db = opts.workspace;

  const attempt = async (): Promise<T> => {
    const res = await fetch(`${BASE_URL}/bd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const errBody = await res.json() as { error?: string; stderr?: string };
        detail = errBody.error ?? '';
        if (errBody.stderr) detail = detail ? `${detail}: ${errBody.stderr}` : errBody.stderr;
      } catch { /* not JSON */ }
      throw { kind: 'server', message: detail || `bd-server returned ${res.status}`, status: res.status } satisfies BdError;
    }
    return (await res.json()) as T;
  };

  try {
    return await attempt();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const err = e as BdError;
    if (err.kind === 'network') {
      await new Promise(r => setTimeout(r, 500));
      return attempt();
    }
    throw e;
  }
}

export const bdClient = { fetch: bdFetch };

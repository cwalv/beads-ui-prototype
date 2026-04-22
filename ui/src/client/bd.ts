import type { BdResponse, BdError } from '../types';

const BASE_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

async function bdFetch<T>(args: string[]): Promise<T> {
  if (!BASE_URL) {
    throw { kind: 'network', message: 'bd-server not configured (VITE_BD_SERVER_URL unset)' } satisfies BdError;
  }

  const attempt = async (): Promise<T> => {
    const res = await fetch(`${BASE_URL}/bd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    if (!res.ok) {
      throw { kind: 'server', message: `bd-server returned ${res.status}`, status: res.status } satisfies BdError;
    }
    const body = (await res.json()) as BdResponse<T>;
    if (!body.ok || body.data === undefined) {
      throw { kind: 'parse', message: body.error?.message ?? 'unexpected response shape' } satisfies BdError;
    }
    return body.data;
  };

  try {
    return await attempt();
  } catch (e) {
    const err = e as BdError;
    if (err.kind === 'network') {
      await new Promise(r => setTimeout(r, 500));
      return attempt();
    }
    throw e;
  }
}

export const bdClient = { fetch: bdFetch };

const BASE_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

export interface BdFetchOptions {
  signal?: AbortSignal;
  workspace?: string;
}

export class BdError extends Error {
  kind: 'network' | 'server';
  status?: number;
  constructor(kind: 'network' | 'server', message: string, status?: number) {
    super(message);
    this.name = 'BdError';
    this.kind = kind;
    this.status = status;
  }
}

// bd-server returns the issue type as `issue_type`, but the rest of the
// UI reads `type`. Walk the response and alias the field on any object
// that has it. Cheap recursion — responses are at most a few hundred
// shallow-ish bead records.
function normalizeWireFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) normalizeWireFields(item);
    return value;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('issue_type' in obj && obj.type === undefined) {
      obj.type = obj.issue_type;
    }
    for (const k of Object.keys(obj)) normalizeWireFields(obj[k]);
  }
  return value;
}

async function bdFetch<T>(args: string[], opts: BdFetchOptions = {}): Promise<T> {
  if (!BASE_URL) {
    throw new BdError('network', 'bd-server not configured (VITE_BD_SERVER_URL unset)');
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
      throw new BdError('server', detail || `bd-server returned ${res.status}`, res.status);
    }
    const parsed = await res.json();
    normalizeWireFields(parsed);
    return parsed as T;
  };

  try {
    return await attempt();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    if (e instanceof BdError && e.kind === 'network') {
      await new Promise(r => setTimeout(r, 500));
      return attempt();
    }
    throw e;
  }
}

export const bdClient = { fetch: bdFetch };

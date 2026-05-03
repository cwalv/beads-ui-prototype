// Typed wrappers for bd-server formula endpoints.
// Raw TOML read/write via GET/PUT /formulas/<dir>/<name>
// Cook preview via POST /bd → bd cook
//
// Listing molecule instances poured from a formula is a pack-specific
// query (gascity uses metadata.gc.formula); see conventions/packs/gascity
// listInstancesByFormula. Other formula primitives are bd-server-level
// and stay here.

import { bdClient } from './bd';
import stubFormulas from './stubs/stub-formulas.json';

const BASE_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

export interface FormulaListItem {
  name: string;
  type: string;
  description: string;
  source: string;
  steps: number;
  vars: number;
}

export async function listFormulas(
  workspace: string,
  signal?: AbortSignal,
): Promise<FormulaListItem[]> {
  if (!BASE_URL) return stubFormulas as FormulaListItem[];
  return bdClient.fetch<FormulaListItem[]>(
    ['formula', 'list'],
    { workspace, signal },
  );
}

export interface FormulaSource {
  raw: string;
  etag: string;
  path: string;
}

export interface CookStep {
  id: string;
  title: string;
  needs: string[];
  [key: string]: unknown;
}

export interface CookResult {
  formula: string;
  vars: Record<string, string>;
  steps: CookStep[];
}

function formulaURL(dir: string, name: string): string {
  return `${BASE_URL}/formulas/${encodeURIComponent(dir)}/${encodeURIComponent(name)}`;
}

export async function getFormulaSource(dir: string, name: string, signal?: AbortSignal): Promise<FormulaSource> {
  if (!BASE_URL) {
    throw { kind: 'network', message: 'bd-server not configured (VITE_BD_SERVER_URL unset)' };
  }
  const res = await fetch(formulaURL(dir, name), { signal });
  if (res.status === 404) {
    throw { kind: 'not-found', message: `Formula "${name}" not found in dir "${dir}"` };
  }
  if (!res.ok) {
    throw { kind: 'server', message: `bd-server returned ${res.status}`, status: res.status };
  }
  const raw = await res.text();
  const etag = res.headers.get('ETag') ?? '';
  const path = res.headers.get('X-Formula-Path') ?? '';
  return { raw, etag, path };
}

export async function writeFormulaSource(
  dir: string,
  name: string,
  raw: string,
  etag: string,
  signal?: AbortSignal,
): Promise<FormulaSource> {
  if (!BASE_URL) {
    throw { kind: 'network', message: 'bd-server not configured (VITE_BD_SERVER_URL unset)' };
  }
  const res = await fetch(formulaURL(dir, name), {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...(etag ? { 'If-Match': etag } : {}),
    },
    body: raw,
    signal,
  });
  if (res.status === 412) {
    throw { kind: 'conflict', message: 'Formula changed on disk since you loaded it' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw { kind: 'server', message: text || `bd-server returned ${res.status}`, status: res.status };
  }
  const newRaw = await res.text().catch(() => raw);
  const newEtag = res.headers.get('ETag') ?? etag;
  const path = res.headers.get('X-Formula-Path') ?? '';
  return { raw: newRaw || raw, etag: newEtag, path };
}

export async function cookFormula(
  formulaName: string,
  vars: Record<string, string>,
  workspace: string,
  signal?: AbortSignal,
): Promise<CookStep[]> {
  const varArgs: string[] = [];
  Object.entries(vars).forEach(([k, v]) => {
    if (v) varArgs.push('--var', `${k}=${v}`);
  });
  const result = await bdClient.fetch<CookResult>(
    ['cook', formulaName, '--mode=runtime', ...varArgs],
    { workspace, signal },
  );
  return result.steps ?? [];
}


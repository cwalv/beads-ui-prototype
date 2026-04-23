// Formula schema fetched from bd-server. v0 hand-curated; later versions will
// passthrough from `bd` itself once an upstream schema spec exists.

const BASE_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

export interface SchemaField {
  key: string;
  type: 'string' | 'string[]' | 'int' | 'bool' | 'enum' | 'table';
  required?: boolean;
  description?: string;
  enum?: string[];
  enumStrict?: boolean;
  example?: string;
}

export interface FormulaSchema {
  version: string;
  topLevel: SchemaField[];
  step: SchemaField[];
  var: SchemaField[];
}

export async function fetchFormulaSchema(signal?: AbortSignal): Promise<FormulaSchema> {
  if (!BASE_URL) throw new Error('VITE_BD_SERVER_URL not set');
  const res = await fetch(`${BASE_URL}/formula-schema`, { signal });
  if (!res.ok) throw new Error(`GET /formula-schema failed: ${res.status}`);
  return (await res.json()) as FormulaSchema;
}

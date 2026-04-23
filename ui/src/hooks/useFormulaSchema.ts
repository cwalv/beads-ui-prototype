import { useEffect, useState } from 'react';
import { fetchFormulaSchema, type FormulaSchema } from '../client/schema';

let cached: FormulaSchema | null = null;
let inflight: Promise<FormulaSchema> | null = null;

// Fetch the formula schema once per page load and cache. Multiple consumers
// share the same fetch — bd-server's response is small and rarely changes.
export function useFormulaSchema(): { schema: FormulaSchema | null; error: string | null } {
  const [schema, setSchema] = useState<FormulaSchema | null>(cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    if (!inflight) inflight = fetchFormulaSchema();
    inflight
      .then(s => { if (!cancelled) { cached = s; setSchema(s); } })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'failed to fetch schema'); });
    return () => { cancelled = true; };
  }, []);

  return { schema, error };
}

import { useState, useEffect, useCallback } from 'react';
import { listFormulas, type FormulaListItem } from '../client/formula';

export interface FormulaListState {
  formulas: FormulaListItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFormulaList(workspace: string | null): FormulaListState {
  const [formulas, setFormulas] = useState<FormulaListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!workspace) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    listFormulas(workspace, ctrl.signal)
      .then(data => {
        if (!ctrl.signal.aborted) {
          setFormulas(data);
          setLoading(false);
        }
      })
      .catch((e: { message?: string }) => {
        if (!ctrl.signal.aborted) {
          setError(e?.message ?? 'Failed to load formulas');
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [workspace, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setKey(k => k + 1), []);

  return { formulas, loading, error, reload };
}

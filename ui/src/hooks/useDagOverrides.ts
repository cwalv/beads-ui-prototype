import { useState, useCallback } from 'react';

export interface NodeOverride {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

type Overrides = Record<string, NodeOverride>;

function storageKey(formulaName: string) {
  return `beads-ui.dag-overrides.${formulaName}`;
}

function load(formulaName: string): Overrides {
  try {
    const raw = localStorage.getItem(storageKey(formulaName));
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
}

function persist(formulaName: string, overrides: Overrides) {
  try {
    localStorage.setItem(storageKey(formulaName), JSON.stringify(overrides));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function useDagOverrides(formulaName: string) {
  const [overrides, setOverrides] = useState<Overrides>(() => load(formulaName));

  const setNodeOverride = useCallback((id: string, partial: NodeOverride) => {
    setOverrides(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...partial } };
      persist(formulaName, next);
      return next;
    });
  }, [formulaName]);

  const reset = useCallback(() => {
    setOverrides({});
    try { localStorage.removeItem(storageKey(formulaName)); } catch {}
  }, [formulaName]);

  return { overrides, setNodeOverride, reset };
}

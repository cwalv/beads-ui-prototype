import { createContext, useContext, useEffect } from 'react';

export interface DirtyAPI {
  dirty: boolean;
  setDirty: (d: boolean) => void;
}

export const DirtyContext = createContext<DirtyAPI | null>(null);

export function useSetDirty(dirty: boolean): void {
  const ctx = useContext(DirtyContext);
  if (!ctx) return;
  const { setDirty } = ctx;
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}

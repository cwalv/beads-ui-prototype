import { useState, useEffect, useCallback, useRef } from 'react';
import { getFormulaSource, writeFormulaSource } from '../client/formula';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface FormulaSourceState {
  saved: string;
  current: string;
  setCurrent: (src: string) => void;
  etag: string;
  editability: 'writable' | 'pack-read-only';
  packSource: string | undefined;
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  saveError: string | null;
  dirty: boolean;
  save: () => Promise<void>;
  reload: () => void;
  forceOverwrite: () => Promise<void>;
}

export function useFormulaSource(
  dir: string | null,
  name: string | null,
  workspace: string | null,
): FormulaSourceState {
  const [saved, setSaved] = useState('');
  const [current, setCurrent] = useState('');
  const [etag, setEtag] = useState('');
  const [editability, setEditability] = useState<'writable' | 'pack-read-only'>('writable');
  const [packSource, setPackSource] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const reloadKey = useRef(0);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!dir || !name || !workspace) return;
    setLoading(true);
    setLoadError(null);
    setSaveState('idle');
    try {
      const result = await getFormulaSource(dir, name, signal);
      if (signal.aborted) return;
      setSaved(result.raw);
      setCurrent(result.raw);
      setEtag(result.etag);
      setEditability(result.editability);
      setPackSource(result.packSource);
    } catch (e: unknown) {
      if (signal.aborted) return;
      const err = e as { message?: string; kind?: string };
      setLoadError(err.message ?? 'Failed to load formula');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [dir, name, workspace, reloadKey.current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const reload = useCallback(() => {
    reloadKey.current++;
    const ctrl = new AbortController();
    load(ctrl.signal);
  }, [load]);

  const save = useCallback(async () => {
    if (!dir || !name || !workspace) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const result = await writeFormulaSource(dir, name, current, etag);
      setSaved(current);
      setEtag(result.etag);
      setSaveState('saved');
      setTimeout(() => setSaveState(s => s === 'saved' ? 'idle' : s), 3000);
    } catch (e: unknown) {
      const err = e as { kind?: string; message?: string };
      if (err.kind === 'conflict') {
        setSaveState('conflict');
      } else {
        setSaveState('error');
        setSaveError(err.message ?? 'Save failed');
      }
    }
  }, [dir, name, workspace, current, etag]);

  const forceOverwrite = useCallback(async () => {
    if (!dir || !name || !workspace) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const result = await writeFormulaSource(dir, name, current, '');
      setSaved(current);
      setEtag(result.etag);
      setSaveState('saved');
      setTimeout(() => setSaveState(s => s === 'saved' ? 'idle' : s), 3000);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setSaveState('error');
      setSaveError(err.message ?? 'Save failed');
    }
  }, [dir, name, workspace, current]);

  return {
    saved,
    current,
    setCurrent,
    etag,
    editability,
    packSource,
    loading,
    loadError,
    saveState,
    saveError,
    dirty: current !== saved,
    save,
    reload,
    forceOverwrite,
  };
}

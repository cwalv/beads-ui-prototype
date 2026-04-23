import { useState, useEffect, useCallback } from 'react';

let globalDocMode = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(fn => fn());
}

export function useDocMode() {
  const [docMode, setDocMode] = useState(() => globalDocMode);

  useEffect(() => {
    const sync = () => setDocMode(globalDocMode);
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  const toggleDocMode = useCallback(() => {
    globalDocMode = !globalDocMode;
    notifyListeners();
  }, []);

  return { docMode, toggleDocMode };
}

// Global ? keypress listener — registered once at module load
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== '?' || e.metaKey || e.ctrlKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    globalDocMode = !globalDocMode;
    notifyListeners();
  });
}

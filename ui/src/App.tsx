import { Suspense, lazy, useState, useCallback, useEffect } from 'react';
import './styles/learn.css';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { TopChrome } from './components/chrome/TopChrome';
import { FootBar } from './components/chrome/FootBar';
import { CommandPalette } from './components/palette/CommandPalette';
import { NotFound } from './components/errors/NotFound';
import { ErrorBoundary } from './components/errors/ErrorBoundary';
import { WorkspaceContext } from './hooks/useWorkspace';
import { FooterContext } from './hooks/useSetFooter';
import { DirtyContext } from './hooks/useSetDirty';
import { fetchWorkspaces } from './client/workspaces';
import type { Workspace } from './types';
import type { FooterContent } from './hooks/useSetFooter';

const AuthorIndex   = lazy(() => import('./routes/author/index'));
const AuthorBrowse  = lazy(() => import('./routes/author/browse'));
const AuthorEdit    = lazy(() => import('./routes/author/edit'));
const ObserveIndex  = lazy(() => import('./routes/observe/index'));
const ObserveFleet  = lazy(() => import('./routes/observe/fleet'));
const ObserveGraph  = lazy(() => import('./routes/observe/graph'));
const ObserveTimeline = lazy(() => import('./routes/observe/timeline'));
const ObserveQueue  = lazy(() => import('./routes/observe/queue'));
const Capture       = lazy(() => import('./routes/capture/index'));
const BeadRoute     = lazy(() => import('./routes/bead/index'));
const BeadModal     = lazy(() => import('./components/peek/BeadModal'));
const DocsIndex     = lazy(() => import('./routes/docs/index'));
const DocsFile      = lazy(() => import('./routes/docs/file'));
const ArchitectureStub = lazy(() => import('./routes/architecture/index'));

const STUB_URL = import.meta.env.VITE_BD_SERVER_URL as string | undefined;

function AppProviders({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrent_] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConsolidated, setConsolidated] = useState(false);
  const [footer, setFooter] = useState<FooterContent>({ left: '', right: '' });
  const [dirty, setDirty] = useState(false);

  const isStub = !STUB_URL;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ws = await fetchWorkspaces();
      setWorkspaces(ws);

      const paramWs = searchParams.get('ws');
      const savedWs = localStorage.getItem('beads-ui.lastWorkspace');
      const initial = ws.find(w => w.name === paramWs)
        ?? ws.find(w => w.name === savedWs)
        ?? ws[0]
        ?? null;
      setCurrent_(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setCurrent = useCallback((name: string) => {
    const ws = workspaces.find(w => w.name === name) ?? null;
    setCurrent_(ws);
    if (ws) localStorage.setItem('beads-ui.lastWorkspace', ws.name);
  }, [workspaces]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces, current, loading, error, isStub, isConsolidated,
      setCurrent, setConsolidated, retry: load,
    }}>
      <FooterContext.Provider value={{ content: footer, setContent: setFooter }}>
        <DirtyContext.Provider value={{ dirty, setDirty }}>
          {children}
        </DirtyContext.Provider>
      </FooterContext.Provider>
    </WorkspaceContext.Provider>
  );
}

function DefaultRedirect() {
  const [searchParams] = useSearchParams();
  const ws = searchParams.get('ws') ?? localStorage.getItem('beads-ui.lastWorkspace') ?? 'fo-beads-ui';
  return <Navigate to={`/author?ws=${ws}`} replace />;
}

interface BackgroundState { backgroundLocation?: Location }

function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const state = location.state as BackgroundState | null;
  const backgroundLocation = state?.backgroundLocation;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-shell">
      <TopChrome onOpenPalette={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <div className="destination-body">
        <ErrorBoundary>
          <Suspense fallback={<div className="placeholder-dest"><span style={{ color: 'var(--mute)' }}>Loading…</span></div>}>
            <Routes location={backgroundLocation || location}>
              <Route path="/" element={<DefaultRedirect />} />
              <Route path="/author" element={<AuthorIndex />} />
              <Route path="/author/browse" element={<AuthorBrowse />} />
              <Route path="/author/edit/:formulaName" element={<AuthorEdit />} />
              <Route path="/author/edit/:formulaName/:tab" element={<AuthorEdit />} />
              <Route path="/architecture" element={<ArchitectureStub />} />
              <Route path="/observe" element={<ObserveIndex />} />
              <Route path="/observe/fleet" element={<ObserveFleet />} />
              <Route path="/observe/graph/:moleculeId" element={<ObserveGraph />} />
              <Route path="/observe/timeline/:moleculeId" element={<ObserveTimeline />} />
              <Route path="/observe/queue" element={<ObserveQueue />} />
              <Route path="/capture" element={<Capture />} />
              <Route path="/bead/:beadId" element={<BeadRoute />} />
              <Route path="/docs" element={<DocsIndex />} />
              <Route path="/docs/:slug" element={<DocsFile />} />
              <Route path="*" element={<NotFound />} />
            </Routes>

            {/* Drawer modal route — renders on top of whatever the main
                Routes block resolved (background location for in-app
                navigation; the BeadRoute deep-link fallback otherwise). */}
            <Routes>
              <Route path="/bead/:beadId" element={<BeadModal />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      <FootBar />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppShell />
      </AppProviders>
    </BrowserRouter>
  );
}

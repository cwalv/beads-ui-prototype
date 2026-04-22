import { useState, useContext } from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { useDestination } from '../../hooks/useDestination';
import { DirtyContext } from '../../hooks/useSetDirty';
import { WorkspaceContext } from '../../hooks/useWorkspace';
import { WorkspaceSwitcher } from '../switcher/WorkspaceSwitcher';
import type { Destination } from '../../types';

const DESTS: { id: Destination; label: string; hint: string }[] = [
  { id: 'author',  label: 'Author',  hint: 'formulas · workflow' },
  { id: 'observe', label: 'Observe', hint: 'molecules · beads' },
  { id: 'capture', label: 'Capture', hint: 'add work' },
];

function pathToBreadcrumb(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

export function TopChrome() {
  const destination = useDestination();
  const dirtyCtx = useContext(DirtyContext);
  const wsCtx = useContext(WorkspaceContext);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const breadcrumb = pathToBreadcrumb(location.pathname);
  const ws = wsCtx?.current;
  const isConsolidated = wsCtx?.isConsolidated ?? false;
  const isStub = wsCtx?.isStub ?? false;
  const wsName = ws?.name ?? '—';
  const wsColor = ws?.color ?? 'var(--ink)';
  const wsParam = searchParams.get('ws') ?? wsName;

  return (
    <>
      <header className="top-chrome">
        <NavLink to={`/author?ws=${wsParam}`} className="mark">
          <span className="dot" />
          beads
        </NavLink>

        <div
          className="ws-pill"
          title="Switch workspace (⌘,)"
          onClick={() => setSwitcherOpen(o => !o)}
          style={{ cursor: 'pointer' }}
        >
          <span className="ws-bar" style={{ background: wsColor }} />
          <span className="ws-name">{wsName}</span>
          {isConsolidated && <span className="ws-multi">+ consolidated</span>}
          {isStub && (
            <span className="ws-stub-dot" title="Running against stubbed workspace list — bd-server not configured" />
          )}
          <span className="ws-caret">▾</span>
        </div>

        <nav className="dest-tabs">
          {DESTS.map(d => {
            const search = searchParams.toString();
            const to = `/${d.id}${search ? `?${search}` : ''}`;
            return (
              <NavLink
                key={d.id}
                to={to}
                className={`dest-tab${destination === d.id ? ' active' : ''}`}
              >
                <span className="dest-lbl">{d.label}</span>
                <span className="dest-hint">{d.hint}</span>
              </NavLink>
            );
          })}
        </nav>

        {breadcrumb.length > 0 && (
          <div className="breadcrumb">
            {breadcrumb.map((seg, i) => (
              <span key={i}>
                {i > 0 && <span className="bc-sep">/</span>}
                <span className={i === breadcrumb.length - 1 ? 'bc-cur' : ''}>{seg}</span>
              </span>
            ))}
            {dirtyCtx?.dirty && <span className="bc-dirty">●</span>}
          </div>
        )}

        <span className="spacer" />

        <div className="search-pill" title="Press to open command palette">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>⌕</span>
          <span style={{ fontSize: 11 }}>Search or run command</span>
          <span className="kbd-inline">⌘K</span>
        </div>
      </header>

      {switcherOpen && (
        <WorkspaceSwitcher onClose={() => setSwitcherOpen(false)} />
      )}
    </>
  );
}

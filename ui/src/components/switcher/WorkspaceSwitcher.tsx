import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../hooks/useWorkspace';
import { LoadingFailedBanner } from '../errors/LoadingFailedBanner';

interface Props {
  onClose: () => void;
}

export function WorkspaceSwitcher({ onClose }: Props) {
  const { workspaces, current, loading, error, isConsolidated, setCurrent, setConsolidated, retry } = useWorkspace();
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const selectWorkspace = (name: string) => {
    setCurrent(name);
    setSearchParams(p => { p.set('ws', name); return p; });
    onClose();
  };

  return (
    <div className="ws-popover-overlay" onClick={onClose}>
      <div className="ws-popover" onClick={e => e.stopPropagation()} data-testid="ws-popover">
        <div className="pop-head">
          <span className="pop-title">Workspace</span>
          <span className="pop-kbd">⌘,</span>
        </div>

        <div className="ws-consolidated-toggle">
          <span>Consolidated view</span>
          <span style={{ flex: 1 }} />
          {(() => {
            const isDisabledOnAuthor = window.location.pathname.startsWith('/author');
            return (
              <button
                className={`ws-toggle${isConsolidated ? ' on' : ''}`}
                onClick={() => setConsolidated(!isConsolidated)}
                disabled={isDisabledOnAuthor}
                title={isDisabledOnAuthor ? 'Consolidated mode is not available on Author — formulas are per-workspace' : undefined}
                style={{ cursor: isDisabledOnAuthor ? 'not-allowed' : 'pointer' }}
                aria-label="Toggle consolidated view"
              >
                <span className="ws-toggle-thumb" />
              </button>
            );
          })()}
        </div>

        {loading && (
          <div style={{ padding: '16px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)' }}>
            Loading workspaces…
          </div>
        )}

        {error && <LoadingFailedBanner kind="workspaces" onRetry={retry} />}

        {!loading && !error && workspaces.length === 0 && (
          <LoadingFailedBanner kind="workspaces" onRetry={retry} />
        )}

        {workspaces.map(ws => (
          <div
            key={ws.name}
            className={`ws-row${current?.name === ws.name ? ' active' : ''}`}
            onClick={() => selectWorkspace(ws.name)}
            data-testid={`ws-row-${ws.name}`}
          >
            <span className="ws-swatch" style={{ background: ws.color ?? 'var(--ink)' }} />
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="ws-row-name">{ws.name}</span>
                {current?.name === ws.name && (
                  <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }}>primary</span>
                )}
              </div>
              {ws.description && <div className="ws-row-meta">{ws.description}</div>}
            </div>
            <input
              type="checkbox"
              checked={current?.name === ws.name}
              readOnly
              style={{ margin: 0 }}
            />
          </div>
        ))}

        <div className="pop-footer">+ Add workspace · point at a .beads/ directory</div>
      </div>
    </div>
  );
}

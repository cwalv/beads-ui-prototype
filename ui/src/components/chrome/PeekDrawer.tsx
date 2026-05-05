import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BeadStatus } from '../../types';

const PEEK_WIDTH_KEY = 'beads-ui.peekWidth';
const PEEK_WIDTH_MIN = 320;
const PEEK_WIDTH_DEFAULT = 420;
function clampPeekWidth(w: number): number {
  const max = Math.max(PEEK_WIDTH_MIN, Math.floor(window.innerWidth * 0.8));
  return Math.min(max, Math.max(PEEK_WIDTH_MIN, w));
}
function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(PEEK_WIDTH_KEY);
    if (!raw) return PEEK_WIDTH_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? clampPeekWidth(n) : PEEK_WIDTH_DEFAULT;
  } catch {
    return PEEK_WIDTH_DEFAULT;
  }
}

interface Props {
  kind?: 'bead' | 'mol';
  id?: string;
  title?: string;
  // Status accepts any string since bd permits user-defined customs;
  // the renderer falls back to a neutral icon for unknown values.
  status?: string;
  onClose?: () => void;
  children?: React.ReactNode;
}

const STATUS_ICON: Record<BeadStatus, string> = {
  open: '○',
  in_progress: '◐',
  blocked: '●',
  deferred: '❄',
  closed: '✓',
  pinned: '⚲',
  hooked: '⚓',
};

const STATUS_CLASS: Record<BeadStatus, string> = {
  open: 'st-open',
  in_progress: 'st-prog',
  blocked: 'st-blocked',
  deferred: 'st-deferred',
  closed: 'st-closed',
  pinned: 'st-pinned',
  hooked: 'st-hooked',
};

function statusIcon(s?: string): string {
  if (!s) return '○';
  return STATUS_ICON[s as BeadStatus] ?? '◇';
}

function statusClass(s?: string): string {
  if (!s) return 'st-open';
  return STATUS_CLASS[s as BeadStatus] ?? 'st-open';
}

export function PeekDrawer({ kind = 'bead', id = '', title = '', status, onClose, children }: Props) {
  const navigate = useNavigate();
  const handleClose = onClose ?? (() => navigate(-1));
  const [width, setWidth] = useState<number>(() => readStoredWidth());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    function onMove(ev: PointerEvent) {
      // dragging the left edge: pointer moving left widens the panel.
      setWidth(clampPeekWidth(startW + (startX - ev.clientX)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [width]);

  // Persist width (debounced) when it changes via resize.
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(PEEK_WIDTH_KEY, String(width)); } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(t);
  }, [width]);

  return (
    <aside className="peek" style={{ width }}>
      <div
        className="peek-resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
        aria-label="Resize panel"
        role="separator"
        aria-orientation="vertical"
      />
      <div className="peek-head">
        <span className="peek-kind">{kind === 'mol' ? 'molecule' : kind}</span>
        <span className="peek-id">{id}</span>
        <span className={`st-icon ${statusClass(status)}`}>{statusIcon(status)}</span>
        <span className="peek-spacer" />
        <button
          className="peek-btn"
          title="Pin drawer as split panel (not yet implemented)"
          aria-label="Pin drawer as split panel (not yet implemented)"
          disabled
        >
          ⚲
        </button>
        <button
          className="peek-btn"
          title="Copy deep link to clipboard"
          aria-label="Copy deep link to clipboard"
          onClick={() => {
            const url = new URL(window.location.href);
            url.pathname = `/bead/${id}`;
            url.search = '';
            navigator.clipboard?.writeText(url.toString()).catch(() => { /* no-op */ });
          }}
        >
          ⎘
        </button>
        <button
          className="peek-btn"
          title="Close panel (Esc) — does not close the bead"
          aria-label="Close panel"
          onClick={handleClose}
        >
          ✕
        </button>
      </div>
      <div className="peek-title">{title}</div>
      {children}
    </aside>
  );
}

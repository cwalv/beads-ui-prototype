import { useNavigate } from 'react-router-dom';
import type { BeadStatus } from '../../types';

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

  return (
    <aside className="peek">
      <div className="peek-head">
        <span className="peek-kind">{kind === 'mol' ? 'molecule' : kind}</span>
        <span className="peek-id">{id}</span>
        <span className={`st-icon ${statusClass(status)}`}>{statusIcon(status)}</span>
        <span className="peek-spacer" />
        <button className="peek-btn" title="Pin drawer as split panel">⚲</button>
        <button
          className="peek-btn"
          title="Copy deep link"
          onClick={() => {
            const url = new URL(window.location.href);
            url.pathname = `/bead/${id}`;
            url.search = '';
            navigator.clipboard?.writeText(url.toString()).catch(() => { /* no-op */ });
          }}
        >
          ⎘
        </button>
        <button className="peek-btn" title="Close" onClick={handleClose}>✕</button>
      </div>
      <div className="peek-title">{title}</div>
      {children}
    </aside>
  );
}

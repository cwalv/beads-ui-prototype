import { useNavigate } from 'react-router-dom';
import type { BeadStatus } from '../../types';

interface Props {
  kind?: 'bead' | 'mol';
  id?: string;
  title?: string;
  status?: BeadStatus;
  children?: React.ReactNode;
}

const STATUS_ICON: Record<BeadStatus, string> = {
  open: '○',
  in_progress: '◐',
  blocked: '●',
  deferred: '❄',
  closed: '✓',
};

const STATUS_CLASS: Record<BeadStatus, string> = {
  open: 'st-open',
  in_progress: 'st-prog',
  blocked: 'st-blocked',
  deferred: 'st-deferred',
  closed: 'st-closed',
};

export function PeekDrawer({ kind = 'bead', id = '', title = '', status = 'open', children }: Props) {
  const navigate = useNavigate();

  return (
    <aside className="peek">
      <div className="peek-head">
        <span className="peek-kind">{kind === 'mol' ? 'molecule' : kind}</span>
        <span className="peek-id">{id}</span>
        <span className={`st-icon ${STATUS_CLASS[status]}`}>{STATUS_ICON[status]}</span>
        <span className="peek-spacer" />
        <button className="peek-btn" title="Pin drawer as split panel">⚲</button>
        <button className="peek-btn" title="Copy deep link">⎘</button>
        <button className="peek-btn" title="Close" onClick={() => navigate(-1)}>✕</button>
      </div>
      <div className="peek-title">{title}</div>
      {children}
    </aside>
  );
}

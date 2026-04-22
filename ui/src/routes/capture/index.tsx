import { useSetFooter } from '../../hooks/useSetFooter';
import type { Destination } from '../../types';

export const handle = {
  destination: 'capture' as Destination,
  breadcrumb: ['capture'],
};

export default function Capture() {
  useSetFooter('1 bead pending · ⌘↵ save & new', 'Capture · single bead');
  return (
    <div className="placeholder-dest">
      <span className="dest-name">Capture</span>
      <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Single-bead form — coming soon</span>
      <span className="dest-bead">→ fo-beads-ui-capture</span>
    </div>
  );
}

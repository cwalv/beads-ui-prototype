import { useSetFooter } from '../../hooks/useSetFooter';
import type { Destination } from '../../types';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'fleet'],
};

export default function ObserveFleet() {
  useSetFooter('molecules · fleet', 'Observe · Fleet · tick 2s');
  return (
    <div className="placeholder-dest">
      <span className="dest-name">Observe · Fleet</span>
      <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Cross-molecule view — coming soon</span>
      <span className="dest-bead">→ fo-beads-ui-observe-graph</span>
    </div>
  );
}

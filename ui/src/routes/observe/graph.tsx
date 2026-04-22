import { useParams } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import type { Destination } from '../../types';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'graph'],
};

export default function ObserveGraph() {
  const { moleculeId = '' } = useParams<{ moleculeId: string }>();
  useSetFooter(`${moleculeId} · dep shape`, 'Observe · Graph');
  return (
    <div className="placeholder-dest">
      <span className="dest-name">Observe · Graph</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>{moleculeId}</span>
      <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Molecule DAG — coming soon</span>
      <span className="dest-bead">→ fo-beads-ui-observe-graph</span>
    </div>
  );
}

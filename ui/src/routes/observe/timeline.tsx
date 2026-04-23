// fo-zz4pz §3: per-molecule execution history stub
import { useParams } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import { StubBanner } from '../../components/chrome/StubBanner';
import { ObserveNav } from '../../components/observe/ObserveNav';
import type { Destination } from '../../types';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'timeline'],
};

export default function ObserveTimeline() {
  const { moleculeId = '' } = useParams<{ moleculeId: string }>();
  useSetFooter(`${moleculeId} · history`, 'Observe · Timeline');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ObserveNav active="timeline" moleculeId={moleculeId} />
      <StubBanner
        title="Observe · Timeline"
        description="Per-molecule execution history — one row per tick / step transition."
        bead="fo-zz4pz"
        prototypeRef="prototype-v1/wf-v2.jsx:ObserveTimeline"
      />
    </div>
  );
}

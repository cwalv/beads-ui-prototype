// fo-zz4pz §2: Observe · Queue stub
import { StubBanner } from '../../components/chrome/StubBanner';
import { ObserveNav } from '../../components/observe/ObserveNav';
import { useSetFooter } from '../../hooks/useSetFooter';
import type { Destination } from '../../types';

export const handle = {
  destination: 'observe' as Destination,
  breadcrumb: ['observe', 'queue'],
};

export default function ObserveQueue() {
  useSetFooter('', 'Observe · Queue');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ObserveNav active="queue" />
      <StubBanner
        title="Observe · Queue"
        description="The ready-queue layout — filters (ready / include-deferred / overdue / unclaimed), grouping by priority, status, or formula, and a CLI mirror strip."
        bead="fo-zz4pz"
        prototypeRef="prototype-v1/wf-views.jsx:WorkQueue"
      />
    </div>
  );
}

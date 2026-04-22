import { useParams, Outlet } from 'react-router-dom';
import { PeekDrawer } from '../../components/chrome/PeekDrawer';

export default function BeadRoute() {
  const { beadId = '' } = useParams<{ beadId: string }>();

  return (
    <>
      <Outlet />
      <PeekDrawer kind="bead" id={beadId} title={`Bead ${beadId}`} status="open">
        <div style={{ padding: '12px 14px', color: 'var(--ink-3)', fontSize: 12 }}>
          Bead detail not yet wired — see fo-beads-ui-observe-graph
        </div>
      </PeekDrawer>
    </>
  );
}

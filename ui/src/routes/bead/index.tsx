// fo-zz4pz §4: shared peek drawer stub
import { useParams, Outlet } from 'react-router-dom';
import { PeekDrawer } from '../../components/chrome/PeekDrawer';
import { StubBanner } from '../../components/chrome/StubBanner';

export default function BeadRoute() {
  const { beadId = '' } = useParams<{ beadId: string }>();

  return (
    <>
      <Outlet />
      <PeekDrawer kind="bead" id={beadId} title={`Bead ${beadId}`} status="open">
        <StubBanner
          title="Bead detail (peek)"
          description="Shared overlay opened from any row across destinations — Fleet, Queue, search, etc."
          bead="fo-zz4pz"
          prototypeRef="prototype-v1/wf-views.jsx:IssueDetail"
        />
      </PeekDrawer>
    </>
  );
}

import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PeekDrawer } from '../chrome/PeekDrawer';
import { IssuePeekBody } from './IssuePeekBody';
import { useOpenPeek } from '../../hooks/usePeek';
import type { Bead } from '../../types';

// Renders the peek drawer for the route `/bead/:beadId`. Mounted by App's
// modal Routes pass; the body fetches the bead and bubbles up the head
// fields via `onBeadLoaded` so we don't need a second fetch.
export default function BeadModal() {
  const { beadId = '' } = useParams<{ beadId: string }>();
  const { close } = useOpenPeek();
  const [head, setHead] = useState<{ title?: string; status?: string } | null>(null);

  // Stable so IssuePeekBody's load callback (which depends on this) does
  // not re-fire the fetch on every parent render.
  const onBeadLoaded = useCallback((b: Bead) => {
    setHead({ title: b.title, status: b.status });
  }, []);

  return (
    <PeekDrawer
      kind="bead"
      id={beadId}
      title={head?.title ?? `Bead ${beadId}`}
      status={head?.status}
      onClose={close}
    >
      <IssuePeekBody
        beadId={beadId}
        onClose={close}
        onBeadLoaded={onBeadLoaded}
      />
    </PeekDrawer>
  );
}

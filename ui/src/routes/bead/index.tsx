import { Suspense, lazy } from 'react';

// Deep-link fallback for `/bead/:beadId`. The drawer itself is rendered
// by App.tsx's modal-Routes pass; this component supplies the underlying
// view that the drawer overlays. For in-app navigation the underlying
// view comes from `state.backgroundLocation` (see App.tsx).
//
// Default underlying view: Observe · Queue. The bead spec (fo-1w8xo)
// names this as the configured-default; revisit once a per-user setting
// exists.

const ObserveQueue = lazy(() => import('../observe/queue'));

export default function BeadDeepLinkUnderlay() {
  return (
    <Suspense fallback={null}>
      <ObserveQueue />
    </Suspense>
  );
}

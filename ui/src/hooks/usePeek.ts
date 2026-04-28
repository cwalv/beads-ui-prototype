import { useNavigate, useLocation, matchPath } from 'react-router-dom';
import type { Location } from 'react-router-dom';

// Peek drawer routing: opening a peek pushes `/bead/:id` and stashes the
// previous location in `state.backgroundLocation`. The app renders the
// underlying view from `backgroundLocation` so the drawer feels modal,
// while the URL stays shareable. Deep links (no state) render a fallback
// view underneath.

interface BackgroundState { backgroundLocation?: Location }

export const PEEK_DEEP_LINK_FALLBACK = '/observe/queue';

export function useOpenPeek() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as BackgroundState | null;

  const open = (beadId: string) => {
    if (location.pathname === `/bead/${beadId}`) return;
    // When chaining (current URL is already /bead/...), preserve the
    // existing backgroundLocation so the underlying view stays put as
    // the user walks dependency / search links between peeks.
    const newBackground = state?.backgroundLocation ?? location;
    navigate(`/bead/${beadId}`, { state: { backgroundLocation: newBackground } });
  };

  const close = () => {
    if (state?.backgroundLocation) {
      navigate(-1);
    } else {
      navigate(PEEK_DEEP_LINK_FALLBACK, { replace: true });
    }
  };

  return { open, close };
}

export function useBackgroundLocation(): Location | undefined {
  const location = useLocation();
  const state = location.state as BackgroundState | null;
  return state?.backgroundLocation;
}

// True when the URL points at /bead/:id, regardless of whether the drawer
// is overlaying a background route or rendering deep-linked. Used by
// underlying views (e.g. graph canvas) to highlight the peeked node.
export function useActivePeekId(): string | null {
  const location = useLocation();
  const match = matchPath('/bead/:beadId', location.pathname);
  return match?.params.beadId ?? null;
}

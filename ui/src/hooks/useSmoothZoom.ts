import { useEffect } from 'react';
import type { RefObject } from 'react';

// Continuous, fluid wheel/pinch zoom on an element. Two callbacks:
//
//   onWheelEvent — called once per wheel event with the raw event. The
//     caller stashes whatever focus state it needs (cursor position in
//     screen coords, graph-space focus point, etc.) so applyScale can
//     reuse it across the animation frames.
//
//   applyScale — called once per rAF frame with the next scale value.
//     The caller uses its stashed focus state to apply the scale + any
//     pan-to-keep-cursor math.
//
// The hook owns: deltaY → factor conversion (proportional, not
// sign-only), target accumulation, clamping, the rAF catch-up loop,
// and listener lifecycle.
//
// Mac/Win trackpad pinch fires wheel events with ctrlKey=true and small
// deltaY at ~60Hz; a mouse wheel "click" is one event with large
// deltaY. Two sensitivity constants give each input the right feel.

export interface SmoothZoomOptions {
  minScale: number;
  maxScale: number;
  getScale: () => number;
  onWheelEvent: (event: WheelEvent) => void;
  applyScale: (scale: number) => void;
  smoothing?: number;          // per-frame catch-up fraction, default 0.25
  wheelSensitivity?: number;   // mouse wheel,  default 0.003
  pinchSensitivity?: number;   // trackpad pinch, default 0.01
}

export function useSmoothZoom(
  ref: RefObject<HTMLElement | null>,
  opts: SmoothZoomOptions,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const {
      minScale, maxScale, getScale, onWheelEvent, applyScale,
      smoothing = 0.25,
      wheelSensitivity = 0.003,
      pinchSensitivity = 0.01,
    } = opts;

    let target = getScale();
    let rafId: number | null = null;

    const tick = () => {
      const cur = getScale();
      const delta = target - cur;
      if (Math.abs(delta) < 0.0005) {
        applyScale(target);
        rafId = null;
        return;
      }
      applyScale(cur + delta * smoothing);
      rafId = requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Resync target if no animation is running — covers external scale
      // changes (e.g. zoom +/- buttons) so the next wheel doesn't snap
      // back to a stale target.
      if (rafId === null) target = getScale();
      onWheelEvent(event);
      const sensitivity = event.ctrlKey ? pinchSensitivity : wheelSensitivity;
      const factor = Math.exp(-event.deltaY * sensitivity);
      target = Math.max(minScale, Math.min(maxScale, target * factor));
      if (rafId === null) rafId = requestAnimationFrame(tick);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  // Callbacks are read fresh at mount; if a caller needs them to update,
  // they should source values from refs rather than closures.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

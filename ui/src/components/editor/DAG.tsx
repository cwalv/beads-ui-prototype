import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { layoutDAG, edgePath } from '../../lib/dag-layout';
import type { Step, ParseError } from '../../lib/formula-parse';
import type { DAGLayout } from '../../lib/dag-layout';
import { useDagOverrides } from '../../hooks/useDagOverrides';
import { HintDot } from '../ui/HintDot';
import { getActivePack } from '../../conventions';
import type { Badge } from '../../conventions';

interface Props {
  formulaName: string;
  steps: Step[];
  layout: DAGLayout;
  selected: string | null;
  onSelect: (id: string) => void;
  errors: ParseError[];
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.15;
const MIN_NODE_W = 160;
const MIN_NODE_H = 60;

interface Transform { zoom: number; panX: number; panY: number; }
const IDENT: Transform = { zoom: 1, panX: 0, panY: 0 };

export function DAG({ formulaName, steps, layout, selected, onSelect, errors }: Props) {
  const cycleIds = new Set<string>();
  errors.forEach(e => e.cycle && e.cycle.forEach(id => cycleIds.add(id)));

  const selDepSet = new Set<string>();
  if (selected) {
    const s = steps.find(x => x.id === selected);
    if (s) s.needs.forEach(n => selDepSet.add(`${n}->${selected}`));
    steps.forEach(x => x.needs.includes(selected) && selDepSet.add(`${selected}->${x.id}`));
  }

  const canvasRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>(IDENT);
  const tRef = useRef(t);
  tRef.current = t;

  const { overrides, setNodeOverride, reset } = useDagOverrides(formulaName);
  const didDragRef = useRef(false);

  const mergedNodes = useMemo(() => {
    const result = { ...layout.nodes };
    for (const id of Object.keys(result)) {
      const ov = overrides[id];
      if (ov) {
        const base = layout.nodes[id];
        result[id] = {
          x: ov.x ?? base.x,
          y: ov.y ?? base.y,
          w: ov.w ?? base.w,
          h: ov.h ?? base.h,
        };
      }
    }
    return result;
  }, [layout.nodes, overrides]);

  // Wheel = zoom centered on cursor (slippy-map style). preventDefault stops the
  // page from scrolling under the canvas.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cur = tRef.current;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cur.zoom * factor));
      // graph point under cursor before zoom
      const gx = (cx - cur.panX) / cur.zoom;
      const gy = (cy - cur.panY) / cur.zoom;
      // pan such that (gx, gy) stays under the cursor at the new zoom
      const newPanX = cx - gx * newZoom;
      const newPanY = cy - gy * newZoom;
      setT({ zoom: newZoom, panX: newPanX, panY: newPanY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Mousedown on empty canvas = pan drag. Mousedown on a node falls through
  // to the node's own onClick.
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ed-node')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startPan = { x: tRef.current.panX, y: tRef.current.panY };
    const move = (ev: MouseEvent) => {
      setT(prev => ({ ...prev, panX: startPan.x + (ev.clientX - startX), panY: startPan.y + (ev.clientY - startY) }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, []);

  const resetView = () => setT(IDENT);

  const onNodeHeaderMouseDown = (e: React.MouseEvent, stepId: string) => {
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const n = mergedNodes[stepId];
    if (!n) return;
    const startNodeX = n.x, startNodeY = n.y;
    let dragging = false;

    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < 3) return;
      if (!dragging) {
        dragging = true;
        didDragRef.current = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      const zoom = tRef.current.zoom;
      setNodeOverride(stepId, { x: startNodeX + dx / zoom, y: startNodeY + dy / zoom });
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (dragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onResizeMouseDown = (e: React.MouseEvent, stepId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const n = mergedNodes[stepId];
    if (!n) return;
    const startW = n.w;
    const startH = overrides[stepId]?.h ?? n.h;

    const move = (ev: MouseEvent) => {
      didDragRef.current = true;
      const zoom = tRef.current.zoom;
      setNodeOverride(stepId, {
        w: Math.max(MIN_NODE_W, startW + (ev.clientX - startX) / zoom),
        h: Math.max(MIN_NODE_H, startH + (ev.clientY - startY) / zoom),
      });
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="ed-dag-canvas" ref={canvasRef} onMouseDown={onMouseDown}>
      {/* Zoom HUD */}
      <div className="ed-dag-hud" onMouseDown={e => e.stopPropagation()}>
        <button onClick={() => setT(p => ({ ...p, zoom: Math.max(MIN_ZOOM, p.zoom / ZOOM_STEP) }))} title="Zoom out">−</button>
        <button onClick={resetView} title="Reset view">{Math.round(t.zoom * 100)}%</button>
        <button onClick={() => setT(p => ({ ...p, zoom: Math.min(MAX_ZOOM, p.zoom * ZOOM_STEP) }))} title="Zoom in">+</button>
        <button onClick={reset} title="Reset layout">⤺</button>
      </div>

      <div
        className="ed-dag-inner"
        style={{
          width: layout.totalW,
          height: layout.totalH,
          transform: `translate(${t.panX}px, ${t.panY}px) scale(${t.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg className="ed-edges" width={layout.totalW} height={layout.totalH} style={{ overflow: 'visible' }}>
          <defs>
            <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="head" />
            </marker>
            <marker id="ah-sel" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="head sel" />
            </marker>
          </defs>
          {layout.edges.map((e, i) => {
            const from = mergedNodes[e.from];
            const to = mergedNodes[e.to];
            if (!from || !to) return null;
            const isSel = selDepSet.has(`${e.from}->${e.to}`);
            return (
              <path key={i}
                className={isSel ? 'sel' : ''}
                d={edgePath(from, to)}
                markerEnd={isSel ? 'url(#ah-sel)' : 'url(#ah)'}
              />
            );
          })}
        </svg>

        {steps.map((s, i) => {
          const n = mergedNodes[s.id ?? ''];
          if (!n) return null;
          const isSel = s.id === selected;
          const isCyc = s.id ? cycleIds.has(s.id) : false;
          const hasHeightOverride = s.id != null && overrides[s.id]?.h !== undefined;
          const pack = getActivePack();
          const md = s.metadata ?? {};
          const packBadges: Array<{ conceptKey: string; badge: Badge }> = [];
          for (const rule of pack.badgeRules) {
            const badge = rule.apply(md);
            if (badge) packBadges.push({ conceptKey: rule.conceptKey, badge });
          }
          return (
            <div
              key={s.id ?? i}
              className={`ed-node ${isSel ? 'sel' : ''} ${isCyc ? 'cyc' : ''}`}
              style={{
                left: n.x,
                top: n.y,
                width: n.w,
                ...(hasHeightOverride ? { height: n.h, overflow: 'hidden' } : {}),
              }}
              onClick={() => {
                if (didDragRef.current) { didDragRef.current = false; return; }
                s.id && onSelect(s.id);
              }}
            >
              <div className="nh" onMouseDown={e => s.id && onNodeHeaderMouseDown(e, s.id)}>
                <span className="idx">{i + 1}</span>
                <span className="id">{s.id || '(no id)'}</span>
              </div>
              <div className="nt">{s.title || <em style={{ color: 'var(--mute)' }}>(no title)</em>}</div>
              {(s.retry || packBadges.length > 0) && (
                <div className="nb">
                  {s.retry && (
                    <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      ↻ {s.retry.max_attempts}× {s.retry.on_exhausted === 'hard_fail' ? '→ fail' : 'soft_fail'}
                      <HintDot conceptKey="retry" />
                    </span>
                  )}
                  {packBadges.map(({ conceptKey, badge }) => (
                    <span key={conceptKey} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {badge.label}
                      <HintDot conceptKey={conceptKey} />
                    </span>
                  ))}
                </div>
              )}
              <div className="ed-node-resize" onMouseDown={e => s.id && onResizeMouseDown(e, s.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { layoutDAG };

import { useRef, useCallback, useEffect, useState } from 'react';
import type { Segment } from '../../lib/formula-highlight';
import type { StepRange, ParseError } from '../../lib/formula-parse';
import { useFormulaSchema } from '../../hooks/useFormulaSchema';
import { SchemaPopover, type PopoverItem } from './SchemaPopover';
import type { SchemaField, FormulaSchema } from '../../client/schema';

interface Props {
  src: string;
  setSrc: (src: string) => void;
  highlighted: Segment[][];
  srcLines: string[];
  selected: string | null;
  stepRanges: StepRange[];
  errors: ParseError[];
  conflictBanner?: React.ReactNode;
  widthPx?: number;
  // Imperative scroll-to-line trigger from outside (e.g. error-badge click).
  // The `n` (nonce) field forces the effect to re-fire even when the same
  // line is requested twice in a row.
  scrollTo?: { line: number; n: number } | null;
  // DAG-node click: scroll + flash the matched [[steps]] block.
  dagScrollTo?: { id: string; n: number } | null;
}

const BASE_FONT_SIZE = 12;
const BASE_LINE_HEIGHT = 18;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3;
const SCALE_STEP = 1.1;

// Kept for callers that still import the constant (e.g. range scrolling math
// elsewhere in the editor that hasn't been zoom-aware yet).
const LINE_HEIGHT = BASE_LINE_HEIGHT;

// ── autocomplete helpers ──────────────────────────────────────────────────────

function detectScope(src: string, cursor: number): 'topLevel' | 'step' | 'var' {
  const lines = src.slice(0, cursor).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('[')) {
      const inner = line.replace(/^\[+|\]+$/g, '').trim().split('.')[0];
      if (inner === 'steps') return 'step';
      if (inner === 'vars') return 'var';
      return 'topLevel';
    }
  }
  return 'topLevel';
}

interface CompletionContext {
  type: 'key' | 'value';
  filter: string;
  scope: 'topLevel' | 'step' | 'var';
  field?: SchemaField;
}

function getCompletionContext(
  src: string,
  cursor: number,
  schema: FormulaSchema,
): CompletionContext | null {
  const textBefore = src.slice(0, cursor);
  const lineStartIdx = textBefore.lastIndexOf('\n') + 1;
  const lineText = textBefore.slice(lineStartIdx);
  const scope = detectScope(src, cursor);
  const fields = scope === 'topLevel' ? schema.topLevel : scope === 'step' ? schema.step : schema.var;

  // Value completion: `key = [partial_value]`
  const eqMatch = lineText.match(/^(\s*[A-Za-z_][A-Za-z0-9_\-.]*)\s*=\s*(.*)$/);
  if (eqMatch) {
    const key = eqMatch[1].trim();
    const filter = eqMatch[2];
    const field = fields.find(f => f.key === key);
    if (field?.enum) return { type: 'value', filter, scope, field };
    return null;
  }

  // Key completion: partial identifier with no `=`
  const keyMatch = lineText.match(/^(\s*)([A-Za-z_][A-Za-z0-9_\-.]*)$/);
  if (keyMatch) return { type: 'key', filter: keyMatch[2], scope };

  return null;
}

function buildPopoverItems(ctx: CompletionContext, schema: FormulaSchema): PopoverItem[] {
  if (ctx.type === 'value') {
    return (ctx.field?.enum ?? [])
      .filter(v => v.startsWith(ctx.filter))
      .map(v => ({ label: v, insertText: v }));
  }
  const fields = ctx.scope === 'topLevel' ? schema.topLevel : ctx.scope === 'step' ? schema.step : schema.var;
  return fields
    .filter(f => f.key.startsWith(ctx.filter))
    .map(f => ({ label: f.key, description: f.description, insertText: `${f.key} = ` }));
}

// Compute caret pixel position within textarea using a hidden mirror div.
// Returns coords relative to the textarea's top-left (scroll-adjusted).
function getCaretCoords(
  ta: HTMLTextAreaElement,
  pos: number,
  fontSize: number,
  lineH: number,
): { top: number; left: number } {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '0',
    whiteSpace: 'pre',
    fontFamily: cs.fontFamily,
    fontSize: `${fontSize}px`,
    lineHeight: `${lineH}px`,
    paddingLeft: cs.paddingLeft,
    paddingRight: cs.paddingRight,
    paddingTop: '0',
    paddingBottom: '0',
    width: `${ta.clientWidth}px`,
    overflow: 'hidden',
  });
  document.body.appendChild(mirror);

  mirror.textContent = ta.value.substring(0, pos);
  const span = document.createElement('span');
  span.textContent = '​';
  mirror.appendChild(span);

  const coords = { top: span.offsetTop - ta.scrollTop, left: span.offsetLeft - ta.scrollLeft };
  document.body.removeChild(mirror);
  return coords;
}

interface PopoverState {
  items: PopoverItem[];
  selIdx: number;
  filterLen: number;
  top: number;
  left: number;
}

export function SourcePane({
  src, setSrc, highlighted, srcLines, selected, stepRanges, errors, conflictBanner, widthPx, scrollTo, dagScrollTo,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const [fontScale, setFontScale] = useState(1);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [flashNonce, setFlashNonce] = useState(0);
  const { schema } = useFormulaSchema();

  const lineH = BASE_LINE_HEIGHT * fontScale;
  const fontSize = BASE_FONT_SIZE * fontScale;
  const scaledTextStyle = { fontSize: `${fontSize}px`, lineHeight: `${lineH}px` };

  const range = selected ? stepRanges.find(r => r.id === selected) : null;
  const errLines = new Set<number>();
  errors.forEach(e => { if (e.line !== undefined) errLines.add(e.line); });

  const syncOverlayScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
    if (scrollRef.current && textareaRef.current) {
      scrollRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Scroll to selected step range. Scaled by current zoom so the offset is
  // pixel-correct regardless of font-scale.
  useEffect(() => {
    if (!range || !textareaRef.current) return;
    const top = range.startLine * lineH;
    textareaRef.current.scrollTop = Math.max(0, top - 60);
  }, [range, lineH]);

  // Reset scroll position to the top when a fresh formula loads. Without this
  // the textarea (and overlay/gutter, which sync to it) can land mid-file —
  // e.g. browser form-state restoration on hard reload — even with no step
  // selected. Run once per src transition to non-empty; further user scrolling
  // is preserved.
  useEffect(() => {
    if (initialScrollDone.current || !src || !textareaRef.current) return;
    if (selected) { initialScrollDone.current = true; return; } // selected steps own scroll
    textareaRef.current.scrollTop = 0;
    if (overlayRef.current) overlayRef.current.scrollTop = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    initialScrollDone.current = true;
  }, [src, selected]);

  // External scroll-to-line trigger (e.g. error-badge click in DAG header).
  useEffect(() => {
    if (!scrollTo || !textareaRef.current) return;
    const top = scrollTo.line * lineH;
    textareaRef.current.scrollTop = Math.max(0, top - 60);
    textareaRef.current.focus();
  }, [scrollTo, lineH]);

  // DAG-node click: scroll source to the matched [[steps]] block and flash it.
  // Uses a nonce so clicking the same node twice re-scrolls and re-flashes.
  useEffect(() => {
    if (!dagScrollTo || !textareaRef.current) return;
    const r = stepRanges.find(rr => rr.id === dagScrollTo.id);
    if (!r) return;
    textareaRef.current.scrollTop = Math.max(0, r.startLine * lineH - 60);
    setFlashNonce(n => n + 1);
  }, [dagScrollTo, lineH, stepRanges]);

  // Close popup on zoom changes — position would be stale.
  useEffect(() => { setPopover(null); }, [fontScale]);

  const computePopover = useCallback((ta: HTMLTextAreaElement, newSrc: string) => {
    if (!schema) { setPopover(null); return; }
    const cursor = ta.selectionStart ?? 0;
    const ctx = getCompletionContext(newSrc, cursor, schema);
    if (!ctx) { setPopover(null); return; }
    const items = buildPopoverItems(ctx, schema);
    if (items.length === 0) { setPopover(null); return; }
    const taRect = ta.getBoundingClientRect();
    const coords = getCaretCoords(ta, cursor, fontSize, lineH);
    setPopover({
      items,
      selIdx: 0,
      filterLen: ctx.filter.length,
      top: taRect.top + coords.top + lineH + 2,
      left: taRect.left + coords.left,
    });
  }, [schema, fontSize, lineH]);

  const commitPopover = useCallback((idx: number) => {
    if (!popover || !textareaRef.current) return;
    const item = popover.items[idx];
    if (!item) return;
    const ta = textareaRef.current;
    const cursor = ta.selectionStart ?? 0;
    const replaceStart = cursor - popover.filterLen;
    const newSrc = src.slice(0, replaceStart) + item.insertText + src.slice(cursor);
    setSrc(newSrc);
    setPopover(null);
    const newCursor = replaceStart + item.insertText.length;
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.selectionStart = newCursor;
      textareaRef.current.selectionEnd = newCursor;
      textareaRef.current.focus();
    });
  }, [popover, src, setSrc]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSrc(e.target.value);
    computePopover(e.target, e.target.value);
  }, [setSrc, computePopover]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!popover) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPopover(p => p ? { ...p, selIdx: Math.min(p.selIdx + 1, p.items.length - 1) } : null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPopover(p => p ? { ...p, selIdx: Math.max(p.selIdx - 1, 0) } : null);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitPopover(popover.selIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPopover(null);
    } else if (
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'Home' || e.key === 'End' ||
      e.key === 'PageUp' || e.key === 'PageDown' ||
      e.ctrlKey || e.metaKey
    ) {
      setPopover(null);
    }
  }, [popover, commitPopover]);

  const zoomOut = () => setFontScale(s => Math.max(MIN_SCALE, s / SCALE_STEP));
  const zoomIn = () => setFontScale(s => Math.min(MAX_SCALE, s * SCALE_STEP));
  const zoomReset = () => setFontScale(1);

  const paneStyle = widthPx !== undefined ? { width: widthPx } : undefined;

  return (
    <div className="ed-src-pane" style={paneStyle}>
      <div className="ed-src-head">
        <span className="lbl">TOML</span>
        <span className="meta">{srcLines.length} lines</span>
        <span style={{ flex: 1 }} />
        <div className="ed-zoom" role="group" aria-label="Source zoom">
          <button onClick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
          <button onClick={zoomReset} title="Reset zoom (100%)" aria-label="Reset zoom">
            {Math.round(fontScale * 100)}%
          </button>
          <button onClick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
        </div>
        {selected && (
          <span className="meta" style={{ marginLeft: 8 }}>selected: {selected}</span>
        )}
      </div>
      <div className="ed-src-wrap">
        {conflictBanner}
        {/* Gutter scroll-sync container */}
        <div className="ed-src-scroll" ref={scrollRef} style={{ pointerEvents: 'none' }}>
          <div className="ed-src-grid">
            <div className="ed-src-gutter" style={{ minHeight: srcLines.length * lineH, ...scaledTextStyle }}>
              {srcLines.map((_, i) => (
                <div
                  key={i}
                  className={errLines.has(i) ? 'g-err' : ''}
                  style={{ height: lineH, lineHeight: `${lineH}px` }}
                >
                  {errLines.has(i) ? '●' : (i + 1)}
                </div>
              ))}
            </div>
            <div />
          </div>
        </div>

        {/* Syntax-highlighted overlay */}
        <div className="ed-src-overlay" ref={overlayRef} style={scaledTextStyle}>
          {range && (
            <div className="ed-src-hl range" style={{
              top: range.startLine * lineH,
              height: (range.endLine - range.startLine + 1) * lineH,
            }} />
          )}
          {range && flashNonce > 0 && (
            <div
              key={flashNonce}
              className="ed-src-hl flash"
              style={{
                top: range.startLine * lineH,
                height: (range.endLine - range.startLine + 1) * lineH,
              }}
            />
          )}
          {highlighted.map((segs, i) => (
            <div key={i} style={{ height: lineH, position: 'relative' }}>
              {segs.map((s, j) => (
                <span key={j} className={s.cls}>{s.text || ' '}</span>
              ))}
            </div>
          ))}
        </div>

        {/* Editable textarea on top — transparent text, visible caret. wrap="off"
            keeps each source line on one visual line (so the gutter line numbers
            stay aligned) and surfaces a horizontal scrollbar for long lines. */}
        <textarea
          ref={textareaRef}
          className="ed-src-textarea"
          spellCheck={false}
          wrap="off"
          value={src}
          onChange={handleChange}
          onScroll={syncOverlayScroll}
          onKeyDown={handleKeyDown}
          onMouseDown={() => setPopover(null)}
          onBlur={() => setPopover(null)}
          style={scaledTextStyle}
        />
      </div>
      {popover && (
        <SchemaPopover
          items={popover.items}
          selectedIdx={popover.selIdx}
          style={{ position: 'fixed', top: popover.top, left: popover.left, zIndex: 1000 }}
          onSelect={idx => setPopover(p => p ? { ...p, selIdx: idx } : null)}
          onCommit={commitPopover}
        />
      )}
    </div>
  );
}

export type { Props as SourcePaneProps };
export { LINE_HEIGHT };

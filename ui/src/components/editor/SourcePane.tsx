import { useRef, useCallback, useEffect } from 'react';
import type { Segment } from '../../lib/formula-highlight';
import type { StepRange, ParseError } from '../../lib/formula-parse';

interface Props {
  src: string;
  setSrc: (src: string) => void;
  highlighted: Segment[][];
  srcLines: string[];
  selected: string | null;
  stepRanges: StepRange[];
  errors: ParseError[];
  conflictBanner?: React.ReactNode;
}

const LINE_HEIGHT = 18;

export function SourcePane({ src, setSrc, highlighted, srcLines, selected, stepRanges, errors, conflictBanner }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Scroll to selected step range
  useEffect(() => {
    if (!range || !textareaRef.current) return;
    const top = range.startLine * LINE_HEIGHT;
    textareaRef.current.scrollTop = Math.max(0, top - 60);
  }, [range]);

  return (
    <div className="ed-src-pane">
      <div className="ed-src-head">
        <span className="lbl">TOML</span>
        <span className="meta">{srcLines.length} lines</span>
        {selected && (
          <span className="meta" style={{ marginLeft: 'auto' }}>selected: {selected}</span>
        )}
      </div>
      <div className="ed-src-wrap">
        {conflictBanner}
        {/* Gutter scroll-sync container */}
        <div className="ed-src-scroll" ref={scrollRef} style={{ pointerEvents: 'none' }}>
          <div className="ed-src-grid">
            <div className="ed-src-gutter" style={{ minHeight: srcLines.length * LINE_HEIGHT }}>
              {srcLines.map((_, i) => (
                <div
                  key={i}
                  className={errLines.has(i) ? 'g-err' : ''}
                  style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
                >
                  {errLines.has(i) ? '●' : (i + 1)}
                </div>
              ))}
            </div>
            <div />
          </div>
        </div>

        {/* Syntax-highlighted overlay */}
        <div className="ed-src-overlay" ref={overlayRef}>
          {range && (
            <div className="ed-src-hl range" style={{
              top: range.startLine * LINE_HEIGHT,
              height: (range.endLine - range.startLine + 1) * LINE_HEIGHT,
            }} />
          )}
          {highlighted.map((segs, i) => (
            <div key={i} style={{ height: LINE_HEIGHT, position: 'relative' }}>
              {segs.map((s, j) => (
                <span key={j} className={s.cls}>{s.text || ' '}</span>
              ))}
            </div>
          ))}
        </div>

        {/* Editable textarea on top — transparent text, visible caret */}
        <textarea
          ref={textareaRef}
          className="ed-src-textarea"
          spellCheck={false}
          value={src}
          onChange={e => setSrc(e.target.value)}
          onScroll={syncOverlayScroll}
        />
      </div>
    </div>
  );
}

export type { Props as SourcePaneProps };
export { LINE_HEIGHT };

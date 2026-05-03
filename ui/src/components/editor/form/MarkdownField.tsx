import { useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { highlightMarkdown } from '../../../lib/markdown-highlight';

const MAX_HEIGHT = 400;

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function MarkdownField({ value, onChange, placeholder, readOnly }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const highlighted = useMemo(() => highlightMarkdown(value), [value]);

  // Auto-grow: resize textarea (and thus the container) to content, capped at MAX_HEIGHT.
  // Runs before paint via useLayoutEffect to prevent a visible jump.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const h = Math.min(ta.scrollHeight, MAX_HEIGHT);
    ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? 'scroll' : 'hidden';
  }, [value]);

  const syncScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  return (
    <div className={`mdf-wrap${readOnly ? ' mdf-wrap--ro' : ''}`}>
      {/* Syntax-highlighted overlay — behind the textarea */}
      <div className="mdf-overlay" ref={overlayRef} aria-hidden>
        {highlighted.map((segs, i) => (
          <div key={i} className="mdf-line">
            {segs.map((s, j) => (
              <span key={j} className={s.cls || undefined}>{s.text}</span>
            ))}
          </div>
        ))}
      </div>
      {/* Transparent textarea — on top, captures input */}
      <textarea
        ref={textareaRef}
        className="mdf-textarea"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
        onChange={e => onChange(e.target.value)}
        onScroll={syncScroll}
      />
    </div>
  );
}

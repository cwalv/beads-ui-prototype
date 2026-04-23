import { useRef, useState, useCallback } from 'react';
import { Popover } from './Popover';
import { getConcept } from '../../data/concepts';
import { useDocMode } from '../../hooks/useDocMode';

interface Props {
  conceptKey: string;
  className?: string;
}

const SHOW_DELAY = 200;

export function HintDot({ conceptKey, className }: Props) {
  const { docMode } = useDocMode();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const concept = getConcept(conceptKey);

  const show = useCallback(() => {
    if (docMode) return;
    timerRef.current = setTimeout(() => setOpen(true), SHOW_DELAY);
  }, [docMode]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  if (!concept) return null;

  const pinned = docMode;

  return (
    <>
      <button
        ref={anchorRef}
        className={`hint-dot${pinned ? ' hint-dot--pinned' : ''} ${className ?? ''}`}
        aria-label={`Learn about ${concept.title}`}
        aria-expanded={open || pinned}
        onClick={toggle}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        type="button"
      >
        ?
      </button>
      {(open || pinned) && (
        <Popover
          anchor={anchorRef as React.RefObject<HTMLElement | null>}
          open={open || pinned}
          onClose={hide}
          title={concept.title}
          kbd={concept.kbd}
          body={concept.body}
          cli={concept.cli}
          docHref={concept.docHref}
        />
      )}
    </>
  );
}

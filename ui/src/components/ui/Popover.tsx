import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

export interface PopoverContent {
  title: string;
  kbd?: string;
  body: string[];
  cli?: string;
  docHref?: string;
}

interface Props extends PopoverContent {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}

const ARROW_SIZE = 8;
const GAP = 6;

interface Pos { top: number; left: number; side: 'bottom' | 'top'; }

function calcPos(anchor: HTMLElement): Pos {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const popW = 300;
  const popH = 180; // estimate

  let top = rect.bottom + GAP + ARROW_SIZE;
  let side: Pos['side'] = 'bottom';
  if (top + popH > vh - 10) {
    top = rect.top - GAP - ARROW_SIZE - popH;
    side = 'top';
  }
  let left = rect.left + rect.width / 2 - popW / 2;
  if (left + popW > vw - 10) left = vw - 10 - popW;
  if (left < 10) left = 10;

  return { top, left, side };
}

export function Popover({ anchor, open, onClose, title, kbd, body, cli, docHref }: Props) {
  const [pos, setPos] = useState<Pos | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    if (anchor.current) setPos(calcPos(anchor.current));
  }, [anchor]);

  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !pos) return null;

  const isDocsLink = docHref?.startsWith('docs/');
  const docTo = isDocsLink ? `/docs/${docHref!.slice(5)}` : docHref;

  return (
    <div
      ref={elRef}
      className={`hint-popover hint-popover--${pos.side}`}
      style={{ top: pos.top, left: pos.left }}
      role="tooltip"
      onMouseLeave={onClose}
    >
      <div className="hp-head">
        <span className="hp-title">{title}</span>
        {kbd && <span className="hp-kbd">{kbd}</span>}
      </div>
      <div className="hp-body">
        {body.map((p, i) => <p key={i}>{p}</p>)}
        {cli && (
          <pre className="hp-cli"><code>{cli}</code></pre>
        )}
      </div>
      {docHref && (
        <div className="hp-doc-link">
          {isDocsLink
            ? <Link to={docTo!} onClick={onClose}>↗ {docHref}</Link>
            : <span>{docHref}</span>
          }
        </div>
      )}
    </div>
  );
}

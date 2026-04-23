import { useEffect, useRef } from 'react';

export interface PopoverItem {
  label: string;
  description?: string;
  insertText: string;
}

interface Props {
  items: PopoverItem[];
  selectedIdx: number;
  style: React.CSSProperties;
  onSelect: (idx: number) => void;
  onCommit: (idx: number) => void;
}

export function SchemaPopover({ items, selectedIdx, style, onSelect, onCommit }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (items.length === 0) return null;

  return (
    <div className="schema-popover" style={style}>
      <div className="schema-popover-list" ref={listRef}>
        {items.map((item, i) => (
          <div
            key={item.label}
            className={`schema-popover-item${i === selectedIdx ? ' sel' : ''}`}
            onMouseDown={e => { e.preventDefault(); onCommit(i); }}
            onMouseEnter={() => onSelect(i)}
          >
            <span className="spi-key">{item.label}</span>
            {item.description && <span className="spi-desc">{item.description}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

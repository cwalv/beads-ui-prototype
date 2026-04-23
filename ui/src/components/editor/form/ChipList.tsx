import { useState, useRef } from 'react';

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function ChipList({ values, onChange, placeholder = 'Add…' }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
    setAdding(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setDraft(''); setAdding(false); }
  };

  const startAdding = () => {
    setAdding(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="fm-chip-list">
      {values.map(v => (
        <span key={v} className="fm-chip">
          {v}
          <button
            className="fm-chip-rm"
            onClick={() => onChange(values.filter(x => x !== v))}
            aria-label={`Remove ${v}`}
          >×</button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          className="fm-chip-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={placeholder}
        />
      ) : (
        <button className="fm-chip-add" onClick={startAdding}>+</button>
      )}
    </div>
  );
}

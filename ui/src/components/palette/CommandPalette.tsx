import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PALETTE_COMMANDS } from './commands';
import { PaletteItem } from './PaletteItem';
import { useDocMode } from '../../hooks/useDocMode';

interface Props {
  open: boolean;
  onClose: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function groupedItems(filtered: typeof PALETTE_COMMANDS) {
  const groups: Record<string, typeof PALETTE_COMMANDS> = {};
  for (const cmd of filtered) {
    if (!groups[cmd.group]) groups[cmd.group] = [];
    groups[cmd.group].push(cmd);
  }
  return groups;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const { docMode } = useDocMode();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return PALETTE_COMMANDS;
    return PALETTE_COMMANDS.filter(c =>
      fuzzyMatch(query, c.title) || fuzzyMatch(query, c.description)
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const runItem = useCallback((idx: number) => {
    const item = filtered[idx];
    if (!item) return;
    if (item.action === 'navigate' && item.target) {
      const ws = searchParams.get('ws');
      const target = ws ? `${item.target}?ws=${ws}` : item.target;
      navigate(target);
      onClose();
    } else if (item.action === 'copy-cli' && item.cli) {
      navigator.clipboard.writeText(item.cli).catch(() => {});
      onClose();
    }
  }, [filtered, navigate, onClose, searchParams]);

  const copyCliItem = useCallback((idx: number) => {
    const item = filtered[idx];
    if (item?.cli) {
      navigator.clipboard.writeText(item.cli).catch(() => {});
      onClose();
    }
  }, [filtered, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey) { copyCliItem(activeIdx); }
        else { runItem(activeIdx); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, activeIdx, filtered.length, runItem, copyCliItem, onClose]);

  if (!open) return null;

  const groups = groupedItems(filtered);
  let flatIdx = 0;

  return (
    <div className="kbar-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div className="kbar" onClick={e => e.stopPropagation()}>
        <div className="kbar-input">
          <span className="prompt">⌕</span>
          <input
            ref={inputRef}
            className="kbar-query"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands…"
            aria-label="Command palette search"
            aria-autocomplete="list"
          />
          <span className="kbd-inline">⌘K</span>
        </div>

        <div className="kbar-groups" role="listbox" aria-label="Commands">
          {filtered.length === 0 && (
            <div className="kbar-empty">No commands match "{query}"</div>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="kbar-group-h">{group}</div>
              {items.map(item => {
                const idx = flatIdx++;
                return (
                  <PaletteItem
                    key={item.title}
                    item={item}
                    active={idx === activeIdx}
                    docMode={docMode}
                    onSelect={() => runItem(idx)}
                    onHover={() => setActiveIdx(idx)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="kbar-foot">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>⌘↵ copy as CLI</span>
          <span className="sp" />
          <span>{PALETTE_COMMANDS.length} commands · fuzzy match</span>
          <span className="sp" />
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

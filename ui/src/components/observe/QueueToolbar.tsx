import { useEffect, useRef, useState } from 'react';
import type { QueueLens } from '../../client/queue';
import {
  type GroupBy,
  type QueueFilters,
  hasActiveFilter,
  EMPTY_FILTERS,
} from '../../lib/queue-filter';

interface Props {
  lens: QueueLens;
  onLensChange: (l: QueueLens) => void;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  filters: QueueFilters;
  onFiltersChange: (f: QueueFilters) => void;
  totalCount: number;
  filteredCount: number;
}

const LENS_OPTIONS: Array<{ id: QueueLens; label: string; hint: string }> = [
  { id: 'ready',          label: 'ready',           hint: 'bd ready — work available now (default)' },
  { id: 'ready-deferred', label: 'ready+deferred',  hint: 'bd ready --include-deferred' },
  { id: 'all',            label: 'all',             hint: 'bd list --status=open,in_progress,blocked,deferred' },
  { id: 'closed',         label: 'closed',          hint: 'bd list --status=closed' },
];

const GROUP_OPTIONS: GroupBy[] = ['priority', 'status', 'formula', 'type', 'none'];

const TYPE_OPTIONS = ['task', 'bug', 'feature', 'epic', 'chore', 'decision', 'molecule', 'convoy', 'message'];
const PRIORITY_OPTIONS = [0, 1, 2, 3, 4];
const STATUS_OPTIONS = ['open', 'in_progress', 'blocked', 'deferred', 'closed'];

export function QueueToolbar({
  lens, onLensChange, groupBy, onGroupByChange, filters, onFiltersChange, totalCount, filteredCount,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror external changes (e.g. URL load)
  useEffect(() => { setSearchTerm(filters.q); }, [filters.q]);

  function commitSearch(value: string) {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, q: value });
    }, 200);
  }

  function toggleType(t: string) {
    const next = filters.types.includes(t)
      ? filters.types.filter(x => x !== t)
      : [...filters.types, t];
    onFiltersChange({ ...filters, types: next });
  }

  function togglePriority(p: number) {
    const next = filters.priorities.includes(p)
      ? filters.priorities.filter(x => x !== p)
      : [...filters.priorities, p];
    onFiltersChange({ ...filters, priorities: next });
  }

  function toggleStatus(s: string) {
    const next = filters.statuses.includes(s)
      ? filters.statuses.filter(x => x !== s)
      : [...filters.statuses, s];
    onFiltersChange({ ...filters, statuses: next });
  }

  function clearFilters() {
    onFiltersChange(EMPTY_FILTERS);
    setSearchTerm('');
  }

  return (
    <div style={{
      borderBottom: '1px solid var(--rule)',
      background: 'var(--bg)',
      flexShrink: 0,
    }}>
      <div style={{
        padding: '8px 20px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {/* Lens */}
        <div role="radiogroup" aria-label="lens" style={{ display: 'flex', gap: 0, border: '1px solid var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
          {LENS_OPTIONS.map((opt, i) => (
            <button
              key={opt.id}
              role="radio"
              aria-checked={lens === opt.id}
              title={opt.hint}
              onClick={() => onLensChange(opt.id)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                border: 'none',
                borderLeft: i === 0 ? 'none' : '1px solid var(--rule)',
                background: lens === opt.id ? 'var(--ink)' : 'var(--bg)',
                color: lens === opt.id ? '#fff' : 'var(--ink-2)',
                cursor: 'pointer',
                fontWeight: lens === opt.id ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="search id or title"
          value={searchTerm}
          onChange={e => commitSearch(e.target.value)}
          style={{
            fontSize: 11.5,
            padding: '3px 8px',
            border: '1px solid var(--rule)',
            borderRadius: 2,
            fontFamily: 'var(--font-mono)',
            width: 200,
          }}
        />

        {/* Quick filters */}
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.unclaimed}
            onChange={e => onFiltersChange({ ...filters, unclaimed: e.target.checked })}
          />
          unclaimed
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.overdue}
            onChange={e => onFiltersChange({ ...filters, overdue: e.target.checked })}
          />
          overdue
        </label>

        {/* More filters toggle */}
        <button
          type="button"
          onClick={() => setMoreOpen(o => !o)}
          aria-expanded={moreOpen}
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            padding: '3px 10px',
            border: '1px solid var(--rule)',
            borderRadius: 2,
            background: moreOpen ? 'var(--bg-3)' : 'var(--bg)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
          }}
        >
          {moreOpen ? '− filters' : '+ filters'}
        </button>

        {hasActiveFilter(filters) && (
          <button
            type="button"
            onClick={clearFilters}
            style={{
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              padding: '3px 10px',
              border: '1px solid var(--rule)',
              borderRadius: 2,
              background: 'var(--bg)',
              color: 'var(--mute)',
              cursor: 'pointer',
            }}
          >
            clear
          </button>
        )}

        <span style={{ flex: 1 }} />

        {/* Counts */}
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>
          {filteredCount === totalCount
            ? `${totalCount} bead${totalCount === 1 ? '' : 's'}`
            : `${filteredCount} of ${totalCount}`}
        </span>

        {/* Group by */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          group by
          {GROUP_OPTIONS.map(g => (
            <button
              key={g}
              aria-pressed={groupBy === g}
              onClick={() => onGroupByChange(g)}
              style={{
                fontSize: 10.5,
                padding: '2px 8px',
                border: '1px solid',
                borderColor: groupBy === g ? 'var(--ink)' : 'var(--rule)',
                borderRadius: 2,
                background: groupBy === g ? 'var(--ink)' : 'var(--bg)',
                color: groupBy === g ? '#fff' : 'var(--mute)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {moreOpen && (
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--rule-2)',
          background: 'var(--bg-2)',
          display: 'flex',
          gap: 18,
          flexWrap: 'wrap',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-2)',
        }}>
          <ChipGroup
            label="type"
            options={TYPE_OPTIONS}
            selected={filters.types}
            toLabel={t => t}
            onToggle={toggleType as (v: string) => void}
          />
          <ChipGroup
            label="priority"
            options={PRIORITY_OPTIONS}
            selected={filters.priorities}
            toLabel={p => `P${p}`}
            onToggle={togglePriority as (v: number) => void}
          />
          {lens === 'all' && (
            <ChipGroup
              label="status"
              options={STATUS_OPTIONS}
              selected={filters.statuses}
              toLabel={s => s}
              onToggle={toggleStatus as (v: string) => void}
            />
          )}
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            label
            <input
              type="text"
              placeholder="contains"
              value={filters.label}
              onChange={e => onFiltersChange({ ...filters, label: e.target.value })}
              style={{
                fontSize: 11,
                padding: '2px 6px',
                border: '1px solid var(--rule)',
                borderRadius: 2,
                fontFamily: 'var(--font-mono)',
                width: 120,
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

interface ChipGroupProps<T extends string | number> {
  label: string;
  options: T[];
  selected: T[];
  toLabel: (v: T) => string;
  onToggle: (v: T) => void;
}

function ChipGroup<T extends string | number>({ label, options, selected, toLabel, onToggle }: ChipGroupProps<T>) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--mute)' }}>{label}</span>
      {options.map(opt => {
        const isOn = selected.includes(opt);
        return (
          <button
            key={String(opt)}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(opt)}
            style={{
              fontSize: 10.5,
              padding: '2px 7px',
              border: '1px solid',
              borderColor: isOn ? 'var(--accent)' : 'var(--rule)',
              borderRadius: 2,
              background: isOn ? 'var(--accent-soft)' : 'var(--bg)',
              color: isOn ? 'var(--accent)' : 'var(--ink-3)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {toLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useFormulaList } from '../../hooks/useFormulaList';
import { LoadingFailedBanner } from '../../components/errors/LoadingFailedBanner';
import type { Destination } from '../../types';
import type { FormulaListItem } from '../../client/formula';

export const handle = {
  destination: 'author' as Destination,
  breadcrumb: ['author', 'browse'],
};

function shortenSource(source: string): string {
  const m = source.match(/\/([^/]+\/\.beads\/formulas)\//);
  if (m) return m[1];
  if (!source.startsWith('/')) return source;
  return source.split('/').slice(-1)[0];
}

function FormulaCard({ formula, onClick }: { formula: FormulaListItem; onClick: () => void }) {
  const desc = formula.description.replace(/…$/, '').trim();
  return (
    <div className="br-card" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}>
      <div className="br-card-name">{formula.name}</div>
      {desc && <div className="br-card-desc">{desc}</div>}
      <div className="br-card-badges">
        <span className={`chip br-type br-type-${formula.type}`}>{formula.type}</span>
        <span className="chip">{formula.steps} step{formula.steps !== 1 ? 's' : ''}</span>
        <span className="chip">{formula.vars} var{formula.vars !== 1 ? 's' : ''}</span>
      </div>
      <div className="br-card-source">{shortenSource(formula.source)}</div>
    </div>
  );
}

export default function AuthorBrowse() {
  const { current: workspace } = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const wsName = workspace?.name ?? null;
  const { formulas, loading, error, reload } = useFormulaList(wsName);

  const types = useMemo(() => {
    const seen = new Set<string>();
    formulas.forEach(f => seen.add(f.type));
    return Array.from(seen).sort();
  }, [formulas]);

  const filtered = useMemo(() => {
    let list = formulas;
    if (typeFilter !== 'all') list = list.filter(f => f.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [formulas, typeFilter, search]);

  const footLeft = loading
    ? 'loading formulas…'
    : error
    ? 'error loading formulas'
    : `${filtered.length} formula${filtered.length !== 1 ? 's' : ''}${typeFilter !== 'all' ? ` · ${typeFilter}` : ''}`;

  useSetFooter(footLeft, 'Author · Browse');

  if (!workspace) {
    return (
      <div className="placeholder-dest">
        <span className="dest-name">Author · Browse</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Select a workspace to browse formulas.</span>
      </div>
    );
  }

  return (
    <div className="br-root">
      <div className="br-bar">
        <div className="br-search-wrap">
          <span className="br-search-icon">⌕</span>
          <input
            type="text"
            className="br-search"
            placeholder="Filter by name or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="br-search-clear" onClick={() => setSearch('')} aria-label="Clear">✕</button>
          )}
        </div>
        <div className="br-filters">
          <button
            className={`br-filter-chip${typeFilter === 'all' ? ' active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All <span className="ct">{formulas.length}</span>
          </button>
          {types.map(t => (
            <button
              key={t}
              className={`br-filter-chip${typeFilter === t ? ' active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t} <span className="ct">{formulas.filter(f => f.type === t).length}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <LoadingFailedBanner kind="formula-list" onRetry={reload} />
        </div>
      )}

      {loading && (
        <div className="br-loading">Loading formulas…</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="br-empty">
          {search || typeFilter !== 'all'
            ? 'No formulas match this filter.'
            : 'No formulas found in this workspace.'}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="br-grid" role="list">
          {filtered.map(f => (
            <FormulaCard
              key={f.name}
              formula={f}
              onClick={() => navigate(`/author/edit/${encodeURIComponent(f.name)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

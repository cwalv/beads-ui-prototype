import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DOC_ENTRIES, DOC_TOTAL_ANCHORS } from '../../lib/docs-index';
import { useSetFooter } from '../../hooks/useSetFooter';

export default function DocsIndex() {
  const [filter, setFilter] = useState('');

  useSetFooter(
    `docs indexed · ${DOC_ENTRIES.length} files · ${DOC_TOTAL_ANCHORS} anchors`,
    'Docs',
  );

  const filtered = filter
    ? DOC_ENTRIES.filter(d =>
        d.title.toLowerCase().includes(filter.toLowerCase()) ||
        d.brief.toLowerCase().includes(filter.toLowerCase())
      )
    : DOC_ENTRIES;

  return (
    <div className="docs-index">
      <div className="docs-index-bar">
        <div className="br-search-wrap">
          <span className="br-search-icon">⌕</span>
          <input
            type="text"
            className="br-search"
            placeholder="Filter docs…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter documentation"
          />
          {filter && (
            <button className="br-search-clear" onClick={() => setFilter('')} aria-label="Clear filter">×</button>
          )}
        </div>
        <span className="docs-index-meta">{filtered.length} of {DOC_ENTRIES.length} files</span>
      </div>

      <div className="docs-index-grid">
        {filtered.map(doc => (
          <Link key={doc.slug} to={`/docs/${doc.slug}`} className="docs-card">
            <div className="docs-card-title">{doc.title}</div>
            <div className="docs-card-filename">{doc.filename}</div>
            {doc.brief && <div className="docs-card-brief">{doc.brief}</div>}
            <div className="docs-card-anchors">{doc.anchors.length} sections</div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="docs-index-empty">No docs match "{filter}"</div>
        )}
      </div>
    </div>
  );
}

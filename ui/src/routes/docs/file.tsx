import { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { getDocBySlug, DOC_ENTRIES, DOC_TOTAL_ANCHORS } from '../../lib/docs-index';
import { renderMarkdown } from '../../lib/markdown-render';
import { slugifyHeading } from '../../lib/slugify';
import { useSetFooter } from '../../hooks/useSetFooter';
import { PaneDivider } from '../../components/ui/PaneDivider';

interface TocEntry { depth: number; text: string; slug: string; }

const TOC_DEFAULT_PX = 240;
const TOC_MIN_PX = 180;
const TOC_STORAGE_KEY = 'beads-ui.docs-toc-px';

function buildToc(raw: string): TocEntry[] {
  const toc: TocEntry[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      const text = m[2].trim();
      const slug = slugifyHeading(text);
      toc.push({ depth: m[1].length, text, slug });
    }
  }
  return toc;
}

export default function DocFile() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  const [tocPx, setTocPx] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(TOC_STORAGE_KEY);
      if (stored) {
        const v = parseInt(stored, 10);
        if (!isNaN(v)) return v;
      }
    } catch {}
    return TOC_DEFAULT_PX;
  });
  const [tocInitialized, setTocInitialized] = useState(false);

  const doc = slug ? getDocBySlug(slug) : null;

  const html = useMemo(() => doc ? renderMarkdown(doc.raw) : '', [doc]);
  const toc = useMemo(() => doc ? buildToc(doc.raw) : [], [doc]);

  useSetFooter(
    `docs indexed · ${DOC_ENTRIES.length} files · ${DOC_TOTAL_ANCHORS} anchors`,
    doc ? doc.filename : '',
  );

  useLayoutEffect(() => {
    if (tocInitialized) return;
    const maxPx = Math.floor(window.innerWidth * 0.4);
    setTocPx(prev => Math.max(TOC_MIN_PX, Math.min(maxPx, prev)));
    setTocInitialized(true);
  }, [tocInitialized]);

  const onTocDrag = useCallback((clientX: number) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const rect = layout.getBoundingClientRect();
    const maxPx = Math.floor(window.innerWidth * 0.4);
    const newPx = Math.max(TOC_MIN_PX, Math.min(maxPx, clientX - rect.left));
    setTocPx(newPx);
    try { localStorage.setItem(TOC_STORAGE_KEY, String(newPx)); } catch {}
  }, []);

  // Hash scrolling
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (!hash || !contentRef.current) return;
    const el = contentRef.current.querySelector(`#${CSS.escape(hash)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, html]);

  // Handle internal /docs/* link clicks inside rendered markdown
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href?.startsWith('/docs/')) return;
      e.preventDefault();
      navigate(href);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [navigate, html]);

  if (!doc) {
    return (
      <div className="docs-file-notfound">
        <div>
          <div className="docs-notfound-title">Doc not found: {slug}</div>
          <Link to="/docs">← Back to docs index</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="docs-file-layout" ref={layoutRef}>
      {/* Sidebar TOC */}
      <nav
        className="docs-toc"
        aria-label="Table of contents"
        style={{ flex: `0 0 ${tocPx}px` }}
      >
        <div className="docs-toc-head">
          <Link to="/docs" className="docs-toc-back">← All docs</Link>
        </div>
        <div className="docs-toc-entries">
          {toc.map((entry, i) => (
            <a
              key={i}
              href={`#${entry.slug}`}
              className={`docs-toc-entry docs-toc-h${entry.depth}`}
              onClick={e => {
                e.preventDefault();
                const el = contentRef.current?.querySelector(`#${CSS.escape(entry.slug)}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                window.history.replaceState(null, '', `#${entry.slug}`);
              }}
            >
              {entry.text}
            </a>
          ))}
        </div>
        <div className="docs-toc-foot">
          <span className="docs-toc-path">{doc.filename}</span>
        </div>
      </nav>

      <PaneDivider onDrag={onTocDrag} />

      {/* Content */}
      <article className="docs-content" aria-label={doc.title}>
        <div
          ref={contentRef}
          className="docs-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </div>
  );
}

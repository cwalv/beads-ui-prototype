import { useParams, Navigate } from 'react-router-dom';
import { useSetFooter } from '../../hooks/useSetFooter';
import type { Destination } from '../../types';

const VALID_TABS = ['source', 'cook', 'instances'] as const;
type Tab = typeof VALID_TABS[number];

export const handle = {
  destination: 'author' as Destination,
  breadcrumb: ['author', 'edit'],
};

export default function AuthorEdit() {
  const { formulaName = '', tab = 'source' } = useParams<{ formulaName: string; tab: string }>();

  if (!VALID_TABS.includes(tab as Tab)) {
    return <Navigate to={`/author/edit/${formulaName}/source`} replace />;
  }

  useSetFooter(`${formulaName} · ${tab}`, 'Author · Edit');

  return (
    <div className="placeholder-dest">
      <span className="dest-name">Author · Edit</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>{formulaName} · {tab}</span>
      <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Two-pane TOML↔DAG editor — coming soon</span>
      <span className="dest-bead">→ fo-beads-ui-author-edit</span>
    </div>
  );
}

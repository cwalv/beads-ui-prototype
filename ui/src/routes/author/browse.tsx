import { useSetFooter } from '../../hooks/useSetFooter';
import type { Destination } from '../../types';

export const handle = {
  destination: 'author' as Destination,
  breadcrumb: ['author', 'browse'],
};

export default function AuthorBrowse() {
  useSetFooter('formulas · browse', 'Author · Browse');
  return (
    <div className="placeholder-dest">
      <span className="dest-name">Author · Browse</span>
      <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Formula catalog — coming soon</span>
      <span className="dest-bead">→ fo-beads-ui-author-browse</span>
    </div>
  );
}

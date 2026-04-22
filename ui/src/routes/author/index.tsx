import { useSetFooter } from '../../hooks/useSetFooter';
import type { Destination } from '../../types';

export const handle = {
  destination: 'author' as Destination,
  breadcrumb: ['author'],
};

export default function AuthorIndex() {
  useSetFooter('Author', 'browse · edit');
  return (
    <div className="placeholder-dest">
      <span className="dest-name">Author</span>
      <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>Formula authoring — coming soon</span>
      <span className="dest-bead">→ fo-beads-ui-author-browse</span>
    </div>
  );
}

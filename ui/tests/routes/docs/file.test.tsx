import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the docs-index to avoid importing raw .md files
vi.mock('../../../src/lib/docs-index', () => ({
  DOC_ENTRIES: [
    {
      slug: 'cli-reference',
      filename: 'CLI_REFERENCE.md',
      title: 'CLI Command Reference',
      brief: 'For: AI agents and developers using bd command-line interface',
      anchors: ['bd-ready', 'bd-create', 'using-formulas'],
      raw: '# CLI Command Reference\n\n## bd ready\n\nList ready issues.\n\n## bd create\n\nCreate a new issue.\n\n## using-formulas\n\nHow to use formulas.',
    },
  ],
  DOC_TOTAL_ANCHORS: 3,
  getDocBySlug: (slug: string) => {
    if (slug === 'cli-reference') return {
      slug: 'cli-reference',
      filename: 'CLI_REFERENCE.md',
      title: 'CLI Command Reference',
      brief: 'For: AI agents...',
      anchors: ['bd-ready', 'bd-create', 'using-formulas'],
      raw: '# CLI Command Reference\n\n## bd ready\n\nList ready issues.\n\n## bd create\n\nCreate a new issue.\n\n## using-formulas\n\nHow to use formulas.',
    };
    return null;
  },
  getDocByFilename: () => null,
}));

vi.mock('../../../src/lib/markdown-render', () => ({
  renderMarkdown: (src: string) => `<div>${src.replace(/\n/g, '<br>')}</div>`,
}));

import DocFile from '../../../src/routes/docs/file';

function Wrapper({ slug }: { slug: string }) {
  return (
    <MemoryRouter initialEntries={[`/docs/${slug}`]}>
      <Routes>
        <Route path="/docs/:slug" element={<DocFile />} />
        <Route path="/docs" element={<div>Docs index</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DocFile route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the document when slug matches', async () => {
    render(<Wrapper slug="cli-reference" />);
    await waitFor(() => {
      expect(screen.getByRole('article')).toBeTruthy();
    });
    expect(screen.getByLabelText('CLI Command Reference')).toBeTruthy();
  });

  it('shows not-found for unknown slug', () => {
    render(<Wrapper slug="nonexistent-doc" />);
    expect(screen.getByText(/Doc not found/i)).toBeTruthy();
    expect(screen.getByText(/← Back to docs index/i)).toBeTruthy();
  });

  it('renders TOC with section links', async () => {
    render(<Wrapper slug="cli-reference" />);
    await waitFor(() => screen.getByRole('navigation', { name: /Table of contents/i }));
    expect(screen.getByText('bd ready')).toBeTruthy();
    expect(screen.getByText('bd create')).toBeTruthy();
  });

  it('shows back link to /docs', async () => {
    render(<Wrapper slug="cli-reference" />);
    await waitFor(() => screen.getByRole('navigation'));
    const backLink = screen.getByText('← All docs');
    expect(backLink).toBeTruthy();
    fireEvent.click(backLink);
    await waitFor(() => {
      expect(screen.getByText('Docs index')).toBeTruthy();
    });
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FooterContext } from '../../../src/hooks/useSetFooter';
import type { FooterAPI } from '../../../src/hooks/useSetFooter';
import type { MoleculeGraph } from '../../../src/types';

vi.mock('@panzoom/panzoom', () => ({
  default: () => ({
    destroy: vi.fn(),
    zoomWithWheel: vi.fn(),
    zoom: vi.fn(),
    pan: vi.fn(),
    getScale: vi.fn(() => 1),
    zoomToPoint: vi.fn(),
  }),
}));

vi.mock('../../../src/hooks/useMoleculeGraph', () => ({
  useMoleculeGraph: vi.fn(),
}));

import { useMoleculeGraph } from '../../../src/hooks/useMoleculeGraph';

const footerApi: FooterAPI = {
  content: { left: '', right: '' },
  setContent: vi.fn(),
};

const emptyGraph: MoleculeGraph = { nodes: [], edges: [], totalW: 0, totalH: 0 };

function Wrapper({ moleculeId }: { moleculeId: string }) {
  return (
    <FooterContext.Provider value={footerApi}>
      <MemoryRouter initialEntries={[`/observe/graph/${moleculeId}`]}>
        <Routes>
          <Route path="/observe/graph/:moleculeId" element={<RouteElement />} />
        </Routes>
      </MemoryRouter>
    </FooterContext.Provider>
  );
}

import React, { Suspense } from 'react';
const ObserveGraph = React.lazy(() => import('../../../src/routes/observe/graph'));

function RouteElement() {
  return (
    <Suspense fallback={<div>loading…</div>}>
      <ObserveGraph />
    </Suspense>
  );
}

describe('ObserveGraph route', () => {
  beforeEach(() => {
    vi.mocked(useMoleculeGraph).mockReturnValue({
      graph: emptyGraph,
      loading: false,
      error: null,
      refresh: vi.fn(),
      patchNode: vi.fn(),
    });
  });

  it('renders graph canvas when data is loaded', async () => {
    render(<Wrapper moleculeId="fo-mol123" />);
    await waitFor(() => {
      expect(screen.queryByText('show more (depth 3 → 6)')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows LoadingFailedBanner when error is set', async () => {
    vi.mocked(useMoleculeGraph).mockReturnValue({
      graph: null,
      loading: false,
      error: 'bd-server unavailable',
      refresh: vi.fn(),
      patchNode: vi.fn(),
    });
    render(<Wrapper moleculeId="fo-mol-fail" />);
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows loading indicator while loading', async () => {
    vi.mocked(useMoleculeGraph).mockReturnValue({
      graph: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
      patchNode: vi.fn(),
    });
    render(<Wrapper moleculeId="fo-mol123" />);
    await waitFor(() => {
      expect(screen.queryByText('computing layout…')).toBeTruthy();
    }, { timeout: 5000 });
  });
});

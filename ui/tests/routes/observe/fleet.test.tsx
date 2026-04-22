import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FooterContext } from '../../../src/hooks/useSetFooter';
import { WorkspaceContext } from '../../../src/hooks/useWorkspace';
import type { FooterAPI } from '../../../src/hooks/useSetFooter';
import type { WorkspaceState } from '../../../src/hooks/useWorkspace';
import type { FleetPollState } from '../../../src/hooks/useFleetPoll';
import type { FleetMolecule } from '../../../src/client/fleet';

vi.mock('../../../src/hooks/useFleetPoll', () => ({
  useFleetPoll: vi.fn(),
}));

import { useFleetPoll } from '../../../src/hooks/useFleetPoll';

const footerApi: FooterAPI = { content: { left: '', right: '' }, setContent: vi.fn() };

function makeWorkspaceCtx(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspaces: [{ name: 'foundations', path: '/tmp/.beads' }],
    current: { name: 'foundations', path: '/tmp/.beads' },
    loading: false,
    error: null,
    isStub: true,
    isConsolidated: false,
    setCurrent: vi.fn(),
    setConsolidated: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function emptyPollState(overrides: Partial<FleetPollState> = {}): FleetPollState {
  return {
    molecules: [],
    loading: false,
    error: null,
    lastTickAt: Date.now(),
    pauseReason: null,
    retryIn: null,
    unreachableWorkspaces: [],
    ...overrides,
  };
}

function mol(id: string, formula = 'do-work', ws = 'foundations'): FleetMolecule {
  return {
    id,
    title: `title-${id}`,
    workspace: ws,
    agg: { formula, currentPhase: 'implement', progress: 0.5, statusRollup: 'running', retryDisplay: null, kindBadge: null },
    createdAt: new Date(Date.now() - 10_000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const ObserveFleet = React.lazy(() => import('../../../src/routes/observe/fleet'));

function Wrapper({ wsCtx = makeWorkspaceCtx(), initialPath = '/observe/fleet' }: {
  wsCtx?: WorkspaceState;
  initialPath?: string;
}) {
  return (
    <WorkspaceContext.Provider value={wsCtx}>
      <FooterContext.Provider value={footerApi}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/observe/fleet" element={
              <Suspense fallback={<div>loading…</div>}>
                <ObserveFleet />
              </Suspense>
            } />
            <Route path="/observe/graph/:moleculeId" element={<div>graph-page</div>} />
          </Routes>
        </MemoryRouter>
      </FooterContext.Provider>
    </WorkspaceContext.Provider>
  );
}

describe('ObserveFleet route', () => {
  beforeEach(() => {
    vi.mocked(useFleetPoll).mockReturnValue(emptyPollState());
  });

  it('renders FleetSummary with correct counts', async () => {
    vi.mocked(useFleetPoll).mockReturnValue(emptyPollState({
      molecules: [mol('a'), mol('b'), mol('c')],
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByText('3 live')).toBeTruthy(), { timeout: 5000 });
  });

  it('shows empty state when no molecules', async () => {
    render(<Wrapper />);
    await waitFor(() =>
      expect(screen.queryByText(/No live molecules/)).toBeTruthy(), { timeout: 5000 }
    );
  });

  it('shows LoadingFailedBanner on initial load failure', async () => {
    vi.mocked(useFleetPoll).mockReturnValue(emptyPollState({
      error: 'network error',
      lastTickAt: null,
      molecules: [],
    }));
    render(<Wrapper />);
    await waitFor(() =>
      expect(screen.queryByRole('alert')).toBeTruthy(), { timeout: 5000 }
    );
  });

  it('keeps rows visible during poll error', async () => {
    vi.mocked(useFleetPoll).mockReturnValue(emptyPollState({
      molecules: [mol('a')],
      error: 'timeout',
      pauseReason: 'error-backoff',
      retryIn: 6,
    }));
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.queryByText('title-a')).toBeTruthy();
      expect(screen.queryByText(/paused · retry in/)).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('navigates to graph on row click', async () => {
    vi.mocked(useFleetPoll).mockReturnValue(emptyPollState({
      molecules: [mol('mol-xyz')],
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByText('title-mol-xyz')).toBeTruthy(), { timeout: 5000 });
    await userEvent.click(screen.getByRole('row'));
    await waitFor(() => expect(screen.queryByText('graph-page')).toBeTruthy(), { timeout: 5000 });
  });

  it('groups molecules by formula', async () => {
    vi.mocked(useFleetPoll).mockReturnValue(emptyPollState({
      molecules: [
        mol('a', 'formula-x'),
        mol('b', 'formula-x'),
        mol('c', 'formula-y'),
      ],
    }));
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.queryByText('formula-x')).toBeTruthy();
      expect(screen.queryByText('formula-y')).toBeTruthy();
      expect(screen.queryByText('2 live')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows "no workspace" placeholder when no current workspace', async () => {
    render(<Wrapper wsCtx={makeWorkspaceCtx({ current: null, workspaces: [] })} />);
    await waitFor(() =>
      expect(screen.queryByText(/Select a workspace/)).toBeTruthy(), { timeout: 5000 }
    );
  });

  it('shows unreachable workspace chip', async () => {
    vi.mocked(useFleetPoll).mockReturnValue(emptyPollState({
      unreachableWorkspaces: ['broken-ws'],
    }));
    render(<Wrapper />);
    await waitFor(() =>
      expect(screen.queryByText(/workspace.*unreachable/i)).toBeTruthy(), { timeout: 5000 }
    );
  });
});

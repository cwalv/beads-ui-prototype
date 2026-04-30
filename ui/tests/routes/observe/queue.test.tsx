import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FooterContext } from '../../../src/hooks/useSetFooter';
import { WorkspaceContext } from '../../../src/hooks/useWorkspace';
import type { FooterAPI } from '../../../src/hooks/useSetFooter';
import type { WorkspaceState } from '../../../src/hooks/useWorkspace';
import type { QueuePollState } from '../../../src/hooks/useQueuePoll';
import type { Bead } from '../../../src/types';

vi.mock('../../../src/hooks/useQueuePoll', () => ({
  useQueuePoll: vi.fn(),
}));

vi.mock('../../../src/client/queue', async () => {
  const actual = await vi.importActual<typeof import('../../../src/client/queue')>('../../../src/client/queue');
  return {
    ...actual,
    claimBead: vi.fn(async () => undefined),
  };
});

import { useQueuePoll } from '../../../src/hooks/useQueuePoll';
import { claimBead } from '../../../src/client/queue';

const footerApi: FooterAPI = { content: { left: '', right: '' }, setContent: vi.fn() };

function makeWorkspaceCtx(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspaces: [{ name: 'foundations', path: '/tmp/.beads', reachable: true }],
    current: { name: 'foundations', path: '/tmp/.beads', reachable: true },
    loading: false,
    error: null,
    isStub: false,
    isConsolidated: false,
    setCurrent: vi.fn(),
    setConsolidated: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function emptyState(
  overrides: Partial<QueuePollState & { refresh: () => Promise<void> }> = {},
): QueuePollState & { refresh: () => Promise<void> } {
  return {
    beads: [],
    loading: false,
    error: null,
    lastTickAt: Date.now(),
    pauseReason: null,
    retryIn: null,
    refresh: vi.fn(async () => undefined),
    ...overrides,
  };
}

function bead(id: string, overrides: Partial<Bead> = {}): Bead {
  return {
    id,
    title: `title-${id}`,
    status: 'open',
    priority: 2,
    type: 'task',
    created_at: new Date(Date.now() - 60_000).toISOString() as unknown as Bead['created_at'],
    updated_at: new Date().toISOString() as unknown as Bead['updated_at'],
    ...overrides,
  } as Bead;
}

const ObserveQueue = React.lazy(() => import('../../../src/routes/observe/queue'));

function Wrapper({
  wsCtx = makeWorkspaceCtx(),
  initialPath = '/observe/queue',
}: { wsCtx?: WorkspaceState; initialPath?: string }) {
  return (
    <WorkspaceContext.Provider value={wsCtx}>
      <FooterContext.Provider value={footerApi}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="/observe/queue"
              element={
                <Suspense fallback={<div>loading…</div>}>
                  <ObserveQueue />
                </Suspense>
              }
            />
            <Route path="/bead/:beadId" element={<div>bead-page</div>} />
          </Routes>
        </MemoryRouter>
      </FooterContext.Provider>
    </WorkspaceContext.Provider>
  );
}

describe('ObserveQueue route', () => {
  beforeEach(() => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState());
    vi.mocked(claimBead).mockClear();
  });

  it('renders empty state when no beads ready', async () => {
    render(<Wrapper />);
    await waitFor(() =>
      expect(screen.queryByText(/Nothing is ready right now/)).toBeTruthy(),
      { timeout: 5000 },
    );
  });

  it('renders rows grouped by priority by default', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [
        bead('b-p0', { priority: 0, title: 'critical thing' }),
        bead('b-p2', { priority: 2, title: 'medium thing' }),
        bead('b-p2-2', { priority: 2, title: 'another medium' }),
      ],
    }));
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.queryByText(/P0 — critical/)).toBeTruthy();
      expect(screen.queryByText(/P2 — medium/)).toBeTruthy();
      expect(screen.queryByText('critical thing')).toBeTruthy();
      expect(screen.queryByText('medium thing')).toBeTruthy();
    });
  });

  it('shows claim button for ready open unassigned beads on ready lens', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [bead('b-1', { status: 'open' })],
    }));
    render(<Wrapper />);
    const claimBtn = await screen.findByRole('button', { name: /^claim$/i });
    expect(claimBtn).toBeTruthy();
  });

  it('hides claim button on the all lens', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [bead('b-1', { status: 'open' })],
    }));
    render(<Wrapper initialPath="/observe/queue?lens=all" />);
    await waitFor(() => expect(screen.queryByText('title-b-1')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^claim$/i })).toBeNull();
  });

  it('claim invokes claimBead and refresh', async () => {
    const refresh = vi.fn();
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [bead('b-1')],
      refresh,
    }));
    render(<Wrapper />);
    const claimBtn = await screen.findByRole('button', { name: /^claim$/i });
    await userEvent.click(claimBtn);
    await waitFor(() => expect(claimBead).toHaveBeenCalledWith('b-1', 'foundations'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('text search filters rows', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [
        bead('b-alpha', { title: 'alpha rocket' }),
        bead('b-bravo', { title: 'bravo zebra' }),
      ],
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByText('alpha rocket')).toBeTruthy());
    await userEvent.type(screen.getByPlaceholderText(/search id or title/i), 'zebra');
    await waitFor(() => {
      expect(screen.queryByText('bravo zebra')).toBeTruthy();
      expect(screen.queryByText('alpha rocket')).toBeNull();
    }, { timeout: 2000 });
  });

  it('unclaimed filter hides assigned beads', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [
        bead('b-free', { title: 'free bead' }),
        bead('b-taken', { title: 'taken bead', assignee: 'someone' }),
      ],
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByText('free bead')).toBeTruthy());
    await userEvent.click(screen.getByRole('checkbox', { name: /unclaimed/i }));
    await waitFor(() => {
      expect(screen.queryByText('free bead')).toBeTruthy();
      expect(screen.queryByText('taken bead')).toBeNull();
    });
  });

  it('lens selector changes URL and CLI mirror', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [bead('b-1', { status: 'in_progress' })],
    }));
    render(<Wrapper />);
    const cli = await screen.findByRole('region', { name: /cli mirror/i });
    expect(within(cli).getByText(/bd ready/)).toBeTruthy();

    await userEvent.click(screen.getByRole('radio', { name: /^all$/i }));
    await waitFor(() => {
      expect(within(cli).getByText(/bd list/)).toBeTruthy();
      expect(within(cli).getByText(/--status=open,in_progress/)).toBeTruthy();
    });
  });

  it('row click navigates to the peek route', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [bead('b-click', { title: 'clickable bead' })],
    }));
    render(<Wrapper />);
    await userEvent.click(await screen.findByText('clickable bead'));
    await waitFor(() => expect(screen.queryByText('bead-page')).toBeTruthy());
  });

  it('shows LoadingFailedBanner on initial fetch failure', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [],
      error: 'boom',
      lastTickAt: null,
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeTruthy());
  });

  it('keeps rows visible during poll error', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [bead('b-stale', { title: 'stale row' })],
      error: 'timeout',
      pauseReason: 'error-backoff',
      retryIn: 6,
    }));
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.queryByText('stale row')).toBeTruthy();
      expect(screen.queryByText(/paused · retry in 6s/)).toBeTruthy();
    });
  });

  it('shows "no workspace" placeholder when no current workspace', async () => {
    render(<Wrapper wsCtx={makeWorkspaceCtx({ current: null, workspaces: [] })} />);
    await waitFor(() => expect(screen.queryByText(/Select a workspace/)).toBeTruthy());
  });

  it('clears filters returns to full list', async () => {
    vi.mocked(useQueuePoll).mockReturnValue(emptyState({
      beads: [
        bead('b-a', { title: 'apple' }),
        bead('b-b', { title: 'banana' }),
      ],
    }));
    render(<Wrapper initialPath="/observe/queue?q=apple" />);
    await waitFor(() => {
      expect(screen.queryByText('apple')).toBeTruthy();
      expect(screen.queryByText('banana')).toBeNull();
    });
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    await waitFor(() => {
      expect(screen.queryByText('banana')).toBeTruthy();
    });
  });
});

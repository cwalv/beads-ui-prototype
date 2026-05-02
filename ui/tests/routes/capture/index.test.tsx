import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FooterContext } from '../../../src/hooks/useSetFooter';
import { WorkspaceContext } from '../../../src/hooks/useWorkspace';
import type { FooterAPI } from '../../../src/hooks/useSetFooter';
import type { WorkspaceState } from '../../../src/hooks/useWorkspace';

vi.mock('../../../src/client/bead', () => ({
  createBead: vi.fn(),
  addDep: vi.fn().mockResolvedValue(undefined),
}));

import { createBead, addDep } from '../../../src/client/bead';

const footerApi: FooterAPI = { content: { left: '', right: '' }, setContent: vi.fn() };

function makeWorkspaceCtx(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspaces: [{ name: 'fo-beads-ui', path: '/tmp/.beads', reachable: true, color: '#2f6fe8' }],
    current: { name: 'fo-beads-ui', path: '/tmp/.beads', reachable: true, color: '#2f6fe8' },
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

const CaptureRoute = React.lazy(() => import('../../../src/routes/capture/index'));

function Wrapper({ wsCtx = makeWorkspaceCtx() }: { wsCtx?: WorkspaceState }) {
  return (
    <WorkspaceContext.Provider value={wsCtx}>
      <FooterContext.Provider value={footerApi}>
        <MemoryRouter initialEntries={['/capture']}>
          <Routes>
            <Route path="/capture" element={
              <Suspense fallback={<div>loading…</div>}>
                <CaptureRoute />
              </Suspense>
            } />
            <Route path="/bead/:beadId" element={<div data-testid="bead-page">bead-page</div>} />
            <Route path="/author" element={<div data-testid="author-page">author</div>} />
          </Routes>
        </MemoryRouter>
      </FooterContext.Provider>
    </WorkspaceContext.Provider>
  );
}

describe('Capture route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title input and Create bead button', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('title-input')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByPlaceholderText('What needs to happen?')).toBeTruthy();
    expect(screen.getByTestId('create-bead-btn')).toBeTruthy();
  });

  it('Create bead is disabled when title is empty', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('create-bead-btn')).toBeTruthy(), { timeout: 5000 });
    const btn = screen.getByTestId('create-bead-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('Create bead is enabled after typing title', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('title-input')).toBeTruthy(), { timeout: 5000 });
    await user.type(screen.getByTestId('title-input'), 'Fix the bug');
    const btn = screen.getByTestId('create-bead-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('calls createBead with title and navigates to bead page on success', async () => {
    const user = userEvent.setup();
    vi.mocked(createBead).mockResolvedValue({
      id: 'fo-xyz99',
      title: 'Fix the bug',
      status: 'open',
    } as any);

    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('title-input')).toBeTruthy(), { timeout: 5000 });
    await user.type(screen.getByTestId('title-input'), 'Fix the bug');
    await user.click(screen.getByTestId('create-bead-btn'));

    await waitFor(() => expect(createBead).toHaveBeenCalledOnce());
    const call = vi.mocked(createBead).mock.calls[0][0];
    expect(call.title).toBe('Fix the bug');
    expect(call.workspace).toBe('fo-beads-ui');

    await waitFor(() => expect(screen.queryByTestId('bead-page')).toBeTruthy(), { timeout: 5000 });
  });

  it('shows error banner when createBead fails', async () => {
    const user = userEvent.setup();
    vi.mocked(createBead).mockRejectedValue(new Error('bd-server not configured'));

    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('title-input')).toBeTruthy(), { timeout: 5000 });
    await user.type(screen.getByTestId('title-input'), 'Some title');
    await user.click(screen.getByTestId('create-bead-btn'));

    await waitFor(() => expect(screen.queryByText(/bd-server not configured/)).toBeTruthy(), { timeout: 5000 });
  });

  it('calls addDep after createBead when deps are added', async () => {
    const user = userEvent.setup();
    vi.mocked(createBead).mockResolvedValue({ id: 'fo-new1', title: 'Test', status: 'open' } as any);
    vi.mocked(addDep).mockResolvedValue(undefined);

    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('title-input')).toBeTruthy(), { timeout: 5000 });
    await user.type(screen.getByTestId('title-input'), 'Test bead');

    const depInput = screen.getByTestId('dep-id-input');
    await user.type(depInput, 'fo-dep1');
    fireEvent.keyDown(depInput, { key: 'Enter' });

    await waitFor(() => expect(screen.queryByText('fo-dep1')).toBeTruthy());

    await user.click(screen.getByTestId('create-bead-btn'));
    await waitFor(() => expect(addDep).toHaveBeenCalledWith('fo-new1', 'fo-dep1', 'blocks'));
  });

  it('sets type from right rail picker', async () => {
    const user = userEvent.setup();
    vi.mocked(createBead).mockResolvedValue({ id: 'fo-new2', title: 'T', status: 'open' } as any);

    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('title-input')).toBeTruthy(), { timeout: 5000 });

    const bugChip = screen.getByText('bug');
    await user.click(bugChip);
    await user.type(screen.getByTestId('title-input'), 'A bug');
    await user.click(screen.getByTestId('create-bead-btn'));

    await waitFor(() => expect(createBead).toHaveBeenCalledOnce());
    expect(vi.mocked(createBead).mock.calls[0][0].type).toBe('bug');
  });

  it('shows success toast with created bead id on save-and-new', async () => {
    const user = userEvent.setup();
    vi.mocked(createBead).mockResolvedValue({ id: 'fo-sav1', title: 'Quick', status: 'open' } as any);

    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByTestId('title-input')).toBeTruthy(), { timeout: 5000 });
    await user.type(screen.getByTestId('title-input'), 'Quick bead');

    const saveNewBtn = screen.getByText('Save & new', { exact: false });
    await user.click(saveNewBtn);

    await waitFor(() => expect(screen.queryByText(/fo-sav1/)).toBeTruthy(), { timeout: 5000 });
    expect((screen.getByTestId('title-input') as HTMLInputElement).value).toBe('');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FooterContext } from '../../../src/hooks/useSetFooter';
import { WorkspaceContext } from '../../../src/hooks/useWorkspace';
import type { FooterAPI } from '../../../src/hooks/useSetFooter';
import type { WorkspaceState } from '../../../src/hooks/useWorkspace';
import type { FormulaListState } from '../../../src/hooks/useFormulaList';
import type { FormulaListItem } from '../../../src/client/formula';

vi.mock('../../../src/hooks/useFormulaList', () => ({
  useFormulaList: vi.fn(),
}));

import { useFormulaList } from '../../../src/hooks/useFormulaList';

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

function emptyListState(overrides: Partial<FormulaListState> = {}): FormulaListState {
  return { formulas: [], loading: false, error: null, reload: vi.fn(), ...overrides };
}

function formula(name: string, type = 'workflow', steps = 3, vars = 2): FormulaListItem {
  return { name, type, description: `Description for ${name}`, source: `/ws/.beads/formulas/${name}.formula.toml`, steps, vars };
}

const AuthorBrowse = React.lazy(() => import('../../../src/routes/author/browse'));

function Wrapper({ wsCtx = makeWorkspaceCtx() }: { wsCtx?: WorkspaceState }) {
  return (
    <WorkspaceContext.Provider value={wsCtx}>
      <FooterContext.Provider value={footerApi}>
        <MemoryRouter initialEntries={['/author/browse']}>
          <Routes>
            <Route path="/author/browse" element={
              <Suspense fallback={<div>loading…</div>}>
                <AuthorBrowse />
              </Suspense>
            } />
            <Route path="/author/edit/:formulaName" element={<div>edit-page</div>} />
          </Routes>
        </MemoryRouter>
      </FooterContext.Provider>
    </WorkspaceContext.Provider>
  );
}

describe('AuthorBrowse route', () => {
  beforeEach(() => {
    vi.mocked(useFormulaList).mockReturnValue(emptyListState());
  });

  it('renders formula cards', async () => {
    vi.mocked(useFormulaList).mockReturnValue(emptyListState({
      formulas: [formula('cooking'), formula('gastownhall-upstream')],
    }));
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.queryByText('cooking')).toBeTruthy();
      expect(screen.queryByText('gastownhall-upstream')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows empty state when no formulas', async () => {
    render(<Wrapper />);
    await waitFor(() =>
      expect(screen.queryByText(/No formulas found/)).toBeTruthy(), { timeout: 5000 }
    );
  });

  it('shows loading state', async () => {
    vi.mocked(useFormulaList).mockReturnValue(emptyListState({ loading: true }));
    render(<Wrapper />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading formulas/)).toBeTruthy(), { timeout: 5000 }
    );
  });

  it('shows error banner and retry button on failure', async () => {
    vi.mocked(useFormulaList).mockReturnValue(emptyListState({ error: 'bd-server error' }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('shows "no workspace" placeholder when no current workspace', async () => {
    render(<Wrapper wsCtx={makeWorkspaceCtx({ current: null })} />);
    await waitFor(() =>
      expect(screen.queryByText(/Select a workspace/)).toBeTruthy(), { timeout: 5000 }
    );
  });

  it('filters cards by search query', async () => {
    vi.mocked(useFormulaList).mockReturnValue(emptyListState({
      formulas: [formula('cooking'), formula('gastownhall-upstream'), formula('pancakes')],
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByText('cooking')).toBeTruthy(), { timeout: 5000 });
    const input = screen.getByPlaceholderText(/filter by name/i);
    await userEvent.type(input, 'cook');
    expect(screen.queryByText('cooking')).toBeTruthy();
    expect(screen.queryByText('gastownhall-upstream')).toBeFalsy();
    expect(screen.queryByText('pancakes')).toBeFalsy();
  });

  it('filters cards by type chip', async () => {
    vi.mocked(useFormulaList).mockReturnValue(emptyListState({
      formulas: [formula('wf-a', 'workflow'), formula('asp-b', 'aspect')],
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByText('wf-a')).toBeTruthy(), { timeout: 5000 });
    await userEvent.click(screen.getByRole('button', { name: /^aspect/ }));
    expect(screen.queryByText('asp-b')).toBeTruthy();
    expect(screen.queryByText('wf-a')).toBeFalsy();
  });

  it('navigates to edit on card click', async () => {
    vi.mocked(useFormulaList).mockReturnValue(emptyListState({
      formulas: [formula('my-formula')],
    }));
    render(<Wrapper />);
    await waitFor(() => expect(screen.queryByText('my-formula')).toBeTruthy(), { timeout: 5000 });
    await userEvent.click(screen.getByText('my-formula'));
    await waitFor(() =>
      expect(screen.queryByText('edit-page')).toBeTruthy(), { timeout: 5000 }
    );
  });
});

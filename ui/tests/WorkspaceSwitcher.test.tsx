import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceSwitcher } from '../src/components/switcher/WorkspaceSwitcher';
import { WorkspaceContext } from '../src/hooks/useWorkspace';
import type { WorkspaceState } from '../src/hooks/useWorkspace';

const ws1 = { name: 'fo-beads-ui', path: '/tmp/fo', reachable: true, description: 'primary', color: '#2f6fe8' };
const ws2 = { name: 'demo', path: '/tmp/demo', reachable: true, description: 'demo', color: '#2d7a4a' };

function makeCtx(overrides?: Partial<WorkspaceState>): WorkspaceState {
  return {
    workspaces: [ws1, ws2],
    current: ws1,
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

function Wrapper({ ctx, onClose }: { ctx: WorkspaceState; onClose: () => void }) {
  return (
    <MemoryRouter>
      <WorkspaceContext.Provider value={ctx}>
        <WorkspaceSwitcher onClose={onClose} />
      </WorkspaceContext.Provider>
    </MemoryRouter>
  );
}

describe('WorkspaceSwitcher', () => {
  it('renders workspace rows', () => {
    render(<Wrapper ctx={makeCtx()} onClose={vi.fn()} />);
    expect(screen.getByTestId('ws-row-fo-beads-ui')).toBeTruthy();
    expect(screen.getByTestId('ws-row-demo')).toBeTruthy();
  });

  it('calls setCurrent and onClose when a row is clicked', () => {
    const ctx = makeCtx();
    const onClose = vi.fn();
    render(<Wrapper ctx={ctx} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('ws-row-demo'));
    expect(ctx.setCurrent).toHaveBeenCalledWith('demo');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows LoadingFailedBanner on error', () => {
    const ctx = makeCtx({ error: 'Network error', workspaces: [] });
    render(<Wrapper ctx={ctx} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('calls retry when retry button is clicked', () => {
    const ctx = makeCtx({ error: 'fail', workspaces: [] });
    render(<Wrapper ctx={ctx} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(ctx.retry).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<Wrapper ctx={makeCtx()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HintDot } from '../src/components/ui/HintDot';

function Wrapper({ conceptKey }: { conceptKey: string }) {
  return (
    <MemoryRouter>
      <HintDot conceptKey={conceptKey} />
    </MemoryRouter>
  );
}

describe('HintDot', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('renders the ? button for a known concept', () => {
    render(<Wrapper conceptKey="retry" />);
    expect(screen.getByRole('button', { name: /Learn about/i })).toBeTruthy();
  });

  it('renders nothing for an unknown concept', () => {
    const { container } = render(<Wrapper conceptKey="not-a-real-concept-xyz" />);
    expect(container.querySelector('.hint-dot')).toBeNull();
  });

  it('shows popover after hover delay', () => {
    render(<Wrapper conceptKey="retry" />);
    const btn = screen.getByRole('button', { name: /Learn about/i });
    fireEvent.mouseEnter(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(screen.getByText('↻ Retry')).toBeTruthy();
  });

  it('clears pending timer on mouseleave so popover never shows', () => {
    render(<Wrapper conceptKey="retry" />);
    const btn = screen.getByRole('button', { name: /Learn about/i });
    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);
    act(() => { vi.advanceTimersByTime(250); });
    // timer was cleared so popover should not appear
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes open popover on Escape', () => {
    render(<Wrapper conceptKey="retry" />);
    const btn = screen.getByRole('button', { name: /Learn about/i });
    fireEvent.mouseEnter(btn);
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('toggles popover on click open/close', () => {
    render(<Wrapper conceptKey="session-affinity" />);
    const btn = screen.getByRole('button', { name: /Learn about/i });
    fireEvent.click(btn);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

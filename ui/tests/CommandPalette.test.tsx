import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../src/components/palette/CommandPalette';

function Wrapper({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <MemoryRouter>
      <CommandPalette open={open} onClose={onClose} />
    </MemoryRouter>
  );
}

describe('CommandPalette', () => {
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => { onClose = vi.fn(); });
  afterEach(() => vi.clearAllMocks());

  it('renders nothing when closed', () => {
    const { container } = render(<Wrapper open={false} onClose={onClose} />);
    expect(container.querySelector('.kbar-overlay')).toBeNull();
  });

  it('renders palette when open', () => {
    render(<Wrapper open={true} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search commands…')).toBeTruthy();
  });

  it('closes on Escape', () => {
    render(<Wrapper open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', () => {
    render(<Wrapper open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('filters commands by query', async () => {
    render(<Wrapper open={true} onClose={onClose} />);
    const input = screen.getByPlaceholderText('Search commands…');
    fireEvent.change(input, { target: { value: 'pour' } });
    await waitFor(() => {
      expect(screen.getByText('bd pour')).toBeTruthy();
    });
    expect(screen.queryByText('bd ready')).toBeNull();
  });

  it('navigates items with ArrowDown/ArrowUp', () => {
    render(<Wrapper open={true} onClose={onClose} />);
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const active = listbox.querySelector('.kbar-item.active');
    expect(active).toBeTruthy();
  });

  it('shows empty state when no match', async () => {
    render(<Wrapper open={true} onClose={onClose} />);
    const input = screen.getByPlaceholderText('Search commands…');
    fireEvent.change(input, { target: { value: 'zzznomatch' } });
    await waitFor(() => {
      expect(screen.getByText(/No commands match/)).toBeTruthy();
    });
  });
});

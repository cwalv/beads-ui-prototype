import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssuePeekBody } from '../src/components/peek/IssuePeekBody';
import type { Bead } from '../src/types';

vi.mock('../src/client/bead', () => ({
  getBead: vi.fn(),
  updateBead: vi.fn().mockResolvedValue(undefined),
  addComment: vi.fn().mockResolvedValue(undefined),
  addDep: vi.fn().mockResolvedValue(undefined),
  removeDep: vi.fn().mockResolvedValue(undefined),
}));

import { getBead } from '../src/client/bead';

const mockBead: Bead = {
  id: 'fo-test-1',
  title: 'Test Bead',
  description: 'A test description',
  status: 'open',
  priority: 2,
  assignee: 'alice',
  dependencies: [{ depends_on_id: 'fo-dep-1', type: 'tracks' }],
  dependents: [{ issue_id: 'fo-child-1', type: 'blocks' }],
  comments: [{ id: 'c1', body: 'Hello world', author: 'bob', created_at: '2026-01-01' }],
  events: [{ id: 'e1', kind: 'status_changed', message: 'opened', author: 'alice', created_at: '2026-01-01' }],
};

beforeEach(() => {
  vi.mocked(getBead).mockResolvedValue(mockBead);
});

describe('IssuePeekBody', () => {
  it('shows Overview tab by default and displays bead title and description', async () => {
    render(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());
    expect(screen.getByText('A test description')).toBeTruthy();
  });

  it('tab switching works: click Deps tab shows deps section', async () => {
    render(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Deps'));
    expect(screen.getByText('depends on (→)')).toBeTruthy();
    expect(screen.getByText('fo-dep-1')).toBeTruthy();
  });

  it('shows Comments tab content when clicked', async () => {
    render(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Comments'));
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('shows Events tab content when clicked', async () => {
    render(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Events'));
    expect(screen.getByText('status_changed')).toBeTruthy();
  });

  it('edit mode: toggle edit button reveals form fields with current values', async () => {
    render(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Edit'));
    const titleInput = screen.getByDisplayValue('Test Bead');
    expect(titleInput).toBeTruthy();
  });
});

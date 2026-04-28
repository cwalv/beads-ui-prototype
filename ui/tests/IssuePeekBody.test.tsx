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

function makeNestedBead(id: string, depType: string): Bead {
  return {
    id,
    title: `Bead ${id}`,
    status: 'open',
    priority: 2,
    type: 'task',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    dependency_type: depType,
  };
}

const mockBead: Bead = {
  id: 'fo-test-1',
  title: 'Test Bead',
  description: 'A test description',
  status: 'open',
  priority: 2,
  type: 'task',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  assignee: 'alice',
  dependencies: [makeNestedBead('fo-dep-1', 'tracks')],
  dependents: [makeNestedBead('fo-child-1', 'blocks')],
  comments: [{ id: 'c1', issue_id: 'fo-test-1', text: 'Hello world', author: 'bob', created_at: '2026-01-01T00:00:00Z' }],
  events: [{ id: 'e1', issue_id: 'fo-test-1', event_type: 'status_changed', actor: 'alice', comment: 'opened', created_at: '2026-01-01T00:00:00Z' }],
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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IssuePeekBody } from '../src/components/peek/IssuePeekBody';
import type { Bead } from '../src/types';

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={['/observe/queue']}>{ui}</MemoryRouter>);
}

vi.mock('../src/client/bead', () => ({
  getBead: vi.fn(),
  updateBead: vi.fn().mockResolvedValue(undefined),
  addComment: vi.fn().mockResolvedValue(undefined),
  addDep: vi.fn().mockResolvedValue(undefined),
  removeDep: vi.fn().mockResolvedValue(undefined),
}));

import { getBead, updateBead } from '../src/client/bead';

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
  owner: 'cwalv',
  labels: ['area:auth', 'good-first-bead'],
  external_ref: 'gh-1234',
  dependencies: [makeNestedBead('fo-dep-1', 'tracks')],
  dependents: [makeNestedBead('fo-child-1', 'blocks')],
  comments: [{ id: 'c1', issue_id: 'fo-test-1', text: 'Hello world', author: 'bob', created_at: '2026-01-01T00:00:00Z' }],
  events: [{ id: 'e1', issue_id: 'fo-test-1', event_type: 'status_changed', actor: 'alice', comment: 'opened', created_at: '2026-01-01T00:00:00Z' }],
};

beforeEach(() => {
  vi.mocked(getBead).mockReset().mockResolvedValue(mockBead);
  vi.mocked(updateBead).mockReset().mockResolvedValue(undefined);
});

describe('IssuePeekBody', () => {
  it('shows Overview tab by default and displays bead title and description', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());
    expect(screen.getByText('A test description')).toBeTruthy();
  });

  it('shows owner and labels in Overview', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());
    expect(screen.getByText('cwalv')).toBeTruthy();
    expect(screen.getByText('area:auth, good-first-bead')).toBeTruthy();
    expect(screen.getByText('gh-1234')).toBeTruthy();
  });

  it('tab switching works: click Deps tab shows deps section', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Deps'));
    expect(screen.getByText('depends on (→)')).toBeTruthy();
    expect(screen.getByText('fo-dep-1')).toBeTruthy();
  });

  it('shows Comments tab content when clicked', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Comments'));
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('shows Events tab when bead has events', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Events'));
    expect(screen.getByText('status_changed')).toBeTruthy();
  });

  it('hides Events tab when bead has no events', async () => {
    vi.mocked(getBead).mockResolvedValue({ ...mockBead, events: undefined });
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());
    expect(screen.queryByText('Events')).toBeNull();
  });

  it('shows Metadata tab when bead has metadata with friendly labels for known keys', async () => {
    vi.mocked(getBead).mockResolvedValue({
      ...mockBead,
      metadata: {
        'gc.kind': 'work',
        'gc.routed_to': 'foundations/worker',
        'custom.unknown': 42,
      },
    });
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Metadata'));
    expect(screen.getByText('gc.kind')).toBeTruthy();
    expect(screen.getByText('kind')).toBeTruthy(); // friendly label
    expect(screen.getByText('routed to')).toBeTruthy();
    expect(screen.getByText('custom.unknown')).toBeTruthy(); // unknown key still shown
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('hides Metadata tab when bead has no metadata', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());
    expect(screen.queryByText('Metadata')).toBeNull();
  });

  it('edit mode: toggle edit button reveals form fields with current values', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Edit'));
    const titleInput = screen.getByDisplayValue('Test Bead');
    expect(titleInput).toBeTruthy();
  });

  it('edit mode: can edit labels (comma-separated) and submits a label diff', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Edit'));
    const labelsInput = screen.getByDisplayValue('area:auth, good-first-bead');
    fireEvent.change(labelsInput, { target: { value: 'area:auth, sprint:q2' } });

    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(updateBead).toHaveBeenCalled();
    });
    const callArgs = vi.mocked(updateBead).mock.calls[0];
    expect(callArgs[0]).toBe('fo-test-1');
    expect(callArgs[1].addLabels).toEqual(['sprint:q2']);
    expect(callArgs[1].removeLabels).toEqual(['good-first-bead']);
  });

  it('edit mode: can edit external_ref', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Edit'));
    const refInput = screen.getByDisplayValue('gh-1234');
    fireEvent.change(refInput, { target: { value: 'jira-FOO-99' } });

    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(updateBead).toHaveBeenCalled();
    });
    const callArgs = vi.mocked(updateBead).mock.calls[0];
    expect(callArgs[1].externalRef).toBe('jira-FOO-99');
  });

  it('dep picker exposes the full canonical dep-type set', async () => {
    renderInRouter(<IssuePeekBody beadId="fo-test-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Test Bead')).toBeTruthy());

    fireEvent.click(screen.getByText('Deps'));
    // Pick a couple representative types from across the buckets:
    // graph-link, entity, reference, delegation. Older code only had
    // 7 workflow/association/convoy types.
    expect(screen.getByText('replies-to')).toBeTruthy();
    expect(screen.getByText('approved-by')).toBeTruthy();
    expect(screen.getByText('caused-by')).toBeTruthy();
    expect(screen.getByText('delegated-from')).toBeTruthy();
  });
});

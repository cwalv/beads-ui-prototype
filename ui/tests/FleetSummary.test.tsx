import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FleetSummary } from '../src/components/observe/FleetSummary';
import type { FleetMolecule } from '../src/client/fleet';

function mol(status: 'running' | 'retry' | 'at-gate' | 'blocked', id = 'x'): FleetMolecule {
  return {
    id,
    title: id,
    workspace: 'w',
    agg: { formula: 'f', currentPhase: '—', progress: 0, statusRollup: status, retryDisplay: null, kindBadge: null },
    createdAt: '',
    updatedAt: '',
  };
}

describe('FleetSummary', () => {
  it('shows correct counts', () => {
    const molecules = [
      mol('running', 'a'),
      mol('running', 'b'),
      mol('retry', 'c'),
      mol('blocked', 'd'),
      mol('at-gate', 'e'),
    ];
    render(<FleetSummary molecules={molecules} groupBy="formula" onGroupByChange={vi.fn()} />);
    expect(screen.getByText('2')).toBeTruthy();  // in progress
    // retrying, at-gate, blocked each show '1'
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('retrying')).toBeTruthy();
    expect(screen.getByText('at gate')).toBeTruthy();
    expect(screen.getByText('blocked')).toBeTruthy();
  });

  it('fires onGroupByChange when group button clicked', async () => {
    const onChange = vi.fn();
    render(<FleetSummary molecules={[]} groupBy="formula" onGroupByChange={onChange} />);
    await userEvent.click(screen.getByText('workspace'));
    expect(onChange).toHaveBeenCalledWith('workspace');
  });

  it('marks active groupBy button as pressed', () => {
    render(<FleetSummary molecules={[]} groupBy="status" onGroupByChange={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'status' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FleetRow } from '../src/components/observe/FleetRow';
import type { FleetMolecule } from '../src/client/fleet';

function makeMolecule(overrides: Partial<FleetMolecule> = {}): FleetMolecule {
  return {
    id: 'mol-abc',
    title: 'Test molecule',
    workspace: 'foundations',
    agg: {
      formula: 'do-work',
      currentPhase: 'implement',
      progress: 0.5,
      statusRollup: 'running',
      retryDisplay: null,
      kindBadge: null,
    },
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('FleetRow', () => {
  it('renders molecule id, title, phase, status, age', () => {
    render(<FleetRow molecule={makeMolecule()} onSelect={vi.fn()} />);
    expect(screen.getByText('mol-abc')).toBeTruthy();
    expect(screen.getByText('Test molecule')).toBeTruthy();
    expect(screen.getByText(/implement/)).toBeTruthy();
    expect(screen.getByText('◐ running')).toBeTruthy();
  });

  it('fires onSelect with molecule id on click', async () => {
    const onSelect = vi.fn();
    render(<FleetRow molecule={makeMolecule()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('row'));
    expect(onSelect).toHaveBeenCalledWith('mol-abc');
  });

  it('renders retry state with warn styling', () => {
    const m = makeMolecule({
      agg: {
        formula: 'do-work',
        currentPhase: 'run-tests',
        progress: 0.4,
        statusRollup: 'retry',
        retryDisplay: 'retry 2/3',
        kindBadge: null,
      },
    });
    render(<FleetRow molecule={m} onSelect={vi.fn()} />);
    expect(screen.getByText(/↻ retry 2\/3/)).toBeTruthy();
  });

  it('renders blocked state', () => {
    const m = makeMolecule({
      agg: {
        formula: 'do-work',
        currentPhase: 'implement',
        progress: 0.2,
        statusRollup: 'blocked',
        retryDisplay: null,
        kindBadge: null,
      },
    });
    render(<FleetRow molecule={m} onSelect={vi.fn()} />);
    expect(screen.getByText('⊘ blocked')).toBeTruthy();
  });

  it('renders kindBadge when present', () => {
    const m = makeMolecule({ agg: { ...makeMolecule().agg, kindBadge: 'workflow' } });
    render(<FleetRow molecule={m} onSelect={vi.fn()} />);
    expect(screen.getByText('workflow')).toBeTruthy();
  });
});

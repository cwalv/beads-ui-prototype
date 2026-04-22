import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GraphFilterRail } from '../src/components/observe/GraphFilterRail';
import type { LayoutNode, Bead } from '../src/types';

function makeNode(id: string, status: Bead['status'], type?: Bead['type']): LayoutNode {
  return {
    id,
    bead: { id, title: `Bead ${id}`, status, type },
    x: 0, y: 0, w: 220, h: 80,
  };
}

describe('GraphFilterRail', () => {
  it('renders status section with counts', () => {
    const nodes = [
      makeNode('1', 'open'),
      makeNode('2', 'open'),
      makeNode('3', 'blocked'),
    ];
    render(
      <GraphFilterRail
        nodes={nodes}
        hiddenStatuses={new Set()}
        hiddenTypes={new Set()}
        onToggleStatus={vi.fn()}
        onToggleType={vi.fn()}
      />
    );
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('onToggleStatus called when status row clicked', () => {
    const onToggleStatus = vi.fn();
    const nodes = [makeNode('1', 'open')];
    render(
      <GraphFilterRail
        nodes={nodes}
        hiddenStatuses={new Set()}
        hiddenTypes={new Set()}
        onToggleStatus={onToggleStatus}
        onToggleType={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('open'));
    expect(onToggleStatus).toHaveBeenCalledWith('open');
  });

  it('renders type section with checkboxes for present types', () => {
    const nodes = [
      makeNode('1', 'open', 'task'),
      makeNode('2', 'open', 'bug'),
    ];
    render(
      <GraphFilterRail
        nodes={nodes}
        hiddenStatuses={new Set()}
        hiddenTypes={new Set()}
        onToggleStatus={vi.fn()}
        onToggleType={vi.fn()}
      />
    );
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('bug')).toBeTruthy();
    expect(screen.getByText('task')).toBeTruthy();
  });

  it('onToggleType called when type checkbox clicked', () => {
    const onToggleType = vi.fn();
    const nodes = [makeNode('1', 'open', 'task')];
    render(
      <GraphFilterRail
        nodes={nodes}
        hiddenStatuses={new Set()}
        hiddenTypes={new Set()}
        onToggleStatus={vi.fn()}
        onToggleType={onToggleType}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleType).toHaveBeenCalledWith('task');
  });
});

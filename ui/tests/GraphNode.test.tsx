import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GraphNode } from '../src/components/observe/GraphNode';
import type { LayoutNode, Bead } from '../src/types';

function makeNode(overrides?: Partial<LayoutNode> & { beadOverrides?: Partial<Bead> }): LayoutNode {
  const { beadOverrides, ...rest } = overrides ?? {};
  return {
    id: 'test-id',
    bead: {
      id: 'test-id',
      title: 'Test Bead Title',
      status: 'open',
      priority: 2,
      type: 'task',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...beadOverrides,
    },
    x: 0,
    y: 0,
    w: 220,
    h: 80,
    ...rest,
  };
}

describe('GraphNode', () => {
  it('renders id, title, and priority', () => {
    render(<GraphNode node={makeNode()} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('test-id')).toBeTruthy();
    expect(screen.getByText('Test Bead Title')).toBeTruthy();
    expect(screen.getByText('p2')).toBeTruthy();
  });

  it('renders status dot for each status', () => {
    const statuses = ['open', 'in_progress', 'blocked', 'deferred', 'closed'] as const;
    for (const status of statuses) {
      const { container, unmount } = render(
        <GraphNode node={makeNode({ beadOverrides: { status } })} selected={false} onSelect={vi.fn()} />
      );
      const dots = container.querySelectorAll('span[style*="border-radius: 50%"]');
      expect(dots.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('ghost node renders with dashed style', () => {
    const { container } = render(
      <GraphNode node={makeNode({ isGhost: true })} selected={false} onSelect={vi.fn()} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.border).toContain('dashed');
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('ready node has ready highlight', () => {
    const { container } = render(
      <GraphNode node={makeNode({ isReady: true })} selected={false} onSelect={vi.fn()} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.border).toContain('var(--accent)');
  });

  it('clicking calls onSelect', () => {
    const onSelect = vi.fn();
    render(<GraphNode node={makeNode()} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

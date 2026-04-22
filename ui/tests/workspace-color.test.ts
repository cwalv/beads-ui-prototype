import { describe, it, expect } from 'vitest';
import { workspaceColor } from '../src/lib/workspace-color';

describe('workspaceColor', () => {
  it('returns a hex color string', () => {
    expect(workspaceColor('foundations')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('is stable for the same input', () => {
    expect(workspaceColor('gc-city')).toBe(workspaceColor('gc-city'));
  });

  it('distributes differently for different names', () => {
    const samples = ['a', 'b', 'c', 'foundations', 'gc-city', 'gastownhall', 'dunbar', 'alpha', 'beta', 'gamma'];
    const colors = samples.map(workspaceColor);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });
});

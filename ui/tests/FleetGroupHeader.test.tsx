import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FleetGroupHeader } from '../src/components/observe/FleetGroupHeader';

describe('FleetGroupHeader', () => {
  it('renders formula name and count', () => {
    render(<FleetGroupHeader formula="gastownhall-upstream" count={3} />);
    expect(screen.getByText('gastownhall-upstream')).toBeTruthy();
    expect(screen.getByText('3 live')).toBeTruthy();
  });

  it('handles count of 1', () => {
    render(<FleetGroupHeader formula="release" count={1} />);
    expect(screen.getByText('1 live')).toBeTruthy();
  });
});

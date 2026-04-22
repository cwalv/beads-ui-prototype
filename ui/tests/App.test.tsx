import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/client/workspaces', () => ({
  fetchWorkspaces: vi.fn().mockResolvedValue([
    { name: 'fo-beads-ui', path: '/tmp/fo', description: 'test', color: '#2f6fe8' },
    { name: 'demo', path: '/tmp/demo', description: 'demo', color: '#2d7a4a' },
  ]),
}));

import App from '../src/App';

describe('App routing', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    localStorage.clear();
  });

  it('redirects / to /author with a ws param', () => {
    render(<App />);
    expect(window.location.pathname).toBe('/author');
  });

  it('renders not-found for unknown routes', async () => {
    window.history.pushState({}, '', '/nonexistent');
    render(<App />);
    await screen.findByRole('main');
    expect(screen.getByText('404')).toBeTruthy();
    expect(screen.getByText(/don't know this address/i)).toBeTruthy();
  });

  it('renders chrome on not-found route', async () => {
    window.history.pushState({}, '', '/nonexistent');
    render(<App />);
    await screen.findByRole('main');
    expect(screen.getByText('beads')).toBeTruthy();
  });
});

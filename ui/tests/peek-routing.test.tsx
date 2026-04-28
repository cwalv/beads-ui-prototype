import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { useOpenPeek, useActivePeekId, useBackgroundLocation } from '../src/hooks/usePeek';

vi.mock('../src/client/bead', () => ({
  getBead: vi.fn().mockResolvedValue({
    id: 'fo-x1',
    title: 'X1',
    status: 'open',
    priority: 2,
    type: 'task',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function BackgroundProbe() {
  const bg = useBackgroundLocation();
  return <div data-testid="bg">{bg ? bg.pathname : 'none'}</div>;
}

function ActivePeekProbe() {
  const id = useActivePeekId();
  return <div data-testid="peek">{id ?? 'none'}</div>;
}

function OpenButton({ id }: { id: string }) {
  const { open } = useOpenPeek();
  return <button onClick={() => open(id)}>open {id}</button>;
}

function CloseButton() {
  const { close } = useOpenPeek();
  return <button onClick={close}>close</button>;
}

function Underlying({ name }: { name: string }) {
  return <div data-testid="underlying">{name}</div>;
}

beforeEach(() => {
  // No-op: tests provide their own initial entries.
});

describe('peek routing', () => {
  it('open() navigates to /bead/:id and stashes the previous location as backgroundLocation', async () => {
    render(
      <MemoryRouter initialEntries={['/observe/fleet']}>
        <LocationProbe />
        <BackgroundProbe />
        <Routes>
          <Route path="/observe/fleet" element={
            <>
              <Underlying name="fleet" />
              <OpenButton id="fo-x1" />
            </>
          } />
          <Route path="/bead/:beadId" element={<Underlying name="deep-link-fallback" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('path').textContent).toBe('/observe/fleet');
    expect(screen.getByTestId('bg').textContent).toBe('none');

    fireEvent.click(screen.getByText('open fo-x1'));

    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/bead/fo-x1');
    });
    expect(screen.getByTestId('bg').textContent).toBe('/observe/fleet');
  });

  it('useActivePeekId returns the bead id from the URL regardless of how we got there', async () => {
    render(
      <MemoryRouter initialEntries={['/bead/fo-direct']}>
        <ActivePeekProbe />
      </MemoryRouter>
    );
    expect(screen.getByTestId('peek').textContent).toBe('fo-direct');
  });

  it('close() with backgroundLocation pops back to the prior URL', async () => {
    render(
      <MemoryRouter initialEntries={['/observe/fleet']}>
        <LocationProbe />
        <Routes>
          <Route path="/observe/fleet" element={
            <>
              <Underlying name="fleet" />
              <OpenButton id="fo-x1" />
            </>
          } />
          <Route path="/bead/:beadId" element={<CloseButton />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('open fo-x1'));
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/bead/fo-x1');
    });

    fireEvent.click(screen.getByText('close'));
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/observe/fleet');
    });
  });

  it('close() without backgroundLocation falls back to the deep-link landing route', async () => {
    render(
      <MemoryRouter initialEntries={['/bead/fo-deep']}>
        <LocationProbe />
        <Routes>
          <Route path="/bead/:beadId" element={<CloseButton />} />
          <Route path="/observe/queue" element={<Underlying name="queue" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('path').textContent).toBe('/bead/fo-deep');
    fireEvent.click(screen.getByText('close'));
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/observe/queue');
    });
  });

  it('open() is a no-op when already on /bead/:id (avoids duplicate history entries)', async () => {
    let capturedLocation: Location | undefined;
    function Capture() {
      capturedLocation = useLocation();
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/bead/fo-x1']}>
        <Capture />
        <Routes>
          <Route path="/bead/:beadId" element={<OpenButton id="fo-x1" />} />
        </Routes>
      </MemoryRouter>
    );
    const initialKey = capturedLocation?.key;
    await act(async () => {
      fireEvent.click(screen.getByText('open fo-x1'));
    });
    expect(capturedLocation?.key).toBe(initialKey);
  });
});

import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

interface RenderWithQueryOptions extends Omit<RenderOptions, 'wrapper'> {
  client?: QueryClient;
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithQueryResult extends RenderResult {
  client: QueryClient;
}

export function renderWithQuery(
  ui: ReactElement,
  options: RenderWithQueryOptions = {},
): RenderWithQueryResult {
  const { client = createTestQueryClient(), ...rest } = options;
  const result = render(ui, {
    ...rest,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...result, client };
}

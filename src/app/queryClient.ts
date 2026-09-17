import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // This is business data on an office LAN — refetching on every window focus is noise.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      // Mutations here post money and stock. A blind retry could double-post; the server's
      // idempotency story is per-endpoint, so never retry by default.
      retry: 0,
    },
  },
});

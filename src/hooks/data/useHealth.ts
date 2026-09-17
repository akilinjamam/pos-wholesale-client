import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from '@/api/endpoints/health';

/**
 * Live API status, polled every 15s.
 *
 * `retry: false` is deliberate — when the server is down we want the Home page to say so
 * immediately, not after three silent retries.
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    retry: false,
    staleTime: 10_000,
  });
}

import { useQuery } from '@tanstack/react-query';

import { getDashboard } from '@/api/endpoints/dashboard';

/**
 * The dashboard (Day 38). Re-read every minute while it is open and whenever the window regains
 * focus: it is the screen left up on the shop's monitor, and a sale at the counter should show.
 */
export const useDashboard = () =>
  useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

import { getData } from '@/api/client';

import type { DashboardPayload } from '@shared/types';

/** The home dashboard (Day 38) — one read; sections the user may not see come back null. */
export const getDashboard = () => getData<DashboardPayload>('/dashboard');

import { getData } from '@/api/client';

import type { HealthPayload } from '@shared/types';

export function fetchHealth(): Promise<HealthPayload> {
  return getData<HealthPayload>('/health');
}

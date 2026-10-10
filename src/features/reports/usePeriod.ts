import { useState } from 'react';

import { useMyLocations } from '@/hooks/data/useLocations';

import { monthStart, periodText, today } from './reportCsv';

/** A report's period and location, starting at this month to today, everywhere the user may see. */
export function usePeriod() {
  const [p, setP] = useState({ from: monthStart(), to: today(), locationId: '' });
  const { data: locations } = useMyLocations();
  const locationName = locations?.find((l) => l.id === p.locationId)?.name;
  return {
    ...p,
    set: (patch: Partial<typeof p>) => setP((x) => ({ ...x, ...patch })),
    subtitle: periodText(p.from, p.to, locationName ?? 'all my locations'),
  };
}

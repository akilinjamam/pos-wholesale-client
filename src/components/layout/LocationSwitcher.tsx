import { Check, MapPin } from 'lucide-react';
import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/app/store';
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from '@/components/ui/dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/data/useAuth';
import { useMyLocations } from '@/hooks/data/useLocations';
import { cn } from '@/lib/utils';
import { setActiveLocation } from '@/store/uiSlice';

/**
 * Which warehouse or counter the user is working in.
 *
 * It does nothing visible yet — the first screens that read it are Stock on Hand (Day 16) and
 * the POS shift (Day 18). It lands now because the topbar is being built now, and because the
 * *resolution* logic below is the part that is easy to get wrong later, when there is data
 * riding on it:
 *
 *  - A persisted id that is no longer in the user's set (they were reassigned, or the warehouse
 *    was deactivated) must be **corrected**, not carried. Left alone, it becomes a stock screen
 *    quietly showing a location the server will refuse to write to.
 *  - The fallback order is the user's `defaultLocationId`, then the first accessible location.
 *  - An unrestricted user (empty `locationIds` — how OWNER and ADMIN are modelled) gets every
 *    active location, so the switcher is a genuine switcher for them and a fixed label for a
 *    cashier assigned to one till.
 */
export function LocationSwitcher() {
  const dispatch = useAppDispatch();
  const user = useCurrentUser();
  const activeId = useAppSelector((s) => s.ui.activeLocationId);
  const { data: locations, isLoading } = useMyLocations();

  const active = locations?.find((l) => l.id === activeId) ?? null;

  useEffect(() => {
    if (!locations || locations.length === 0) return;
    if (active) return;

    const fallback =
      locations.find((l) => l.id === user?.defaultLocationId) ?? locations[0] ?? null;

    // Only dispatch when it would actually change something — otherwise this effect and the
    // selector it reads would re-enter each other.
    if (fallback && fallback.id !== activeId) {
      dispatch(setActiveLocation(fallback.id));
    }
  }, [locations, active, activeId, user?.defaultLocationId, dispatch]);

  if (isLoading) {
    return <Skeleton className="h-8 w-32" />;
  }

  if (!locations || locations.length === 0) return null;

  // One location is not a choice. Showing a dropdown that can only reselect what is already
  // selected is noise on a counter terminal.
  if (locations.length === 1) {
    return (
      <span className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground sm:inline-flex">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        <span className="max-w-[10rem] truncate">{locations[0]!.name}</span>
      </span>
    );
  }

  return (
    <Dropdown
      className="w-60"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{active?.name ?? 'Choose location'}</span>
        </button>
      )}
    >
      <DropdownLabel>Working location</DropdownLabel>
      <DropdownSeparator />

      {locations.map((location) => {
        const selected = location.id === activeId;
        return (
          <DropdownItem
            key={location.id}
            selected={selected}
            onClick={() => dispatch(setActiveLocation(location.id))}
          >
            <Check
              className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{location.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{location.code}</span>
          </DropdownItem>
        );
      })}
    </Dropdown>
  );
}

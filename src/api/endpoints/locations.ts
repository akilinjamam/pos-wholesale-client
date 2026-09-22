import { deleteData, getData, getPage, patchData, postData } from '@/api/client';

import type { LocationType } from '@shared/enums';
import type { LocationPayload, Paginated } from '@shared/types';

export type ListLocationsParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  type?: LocationType;
  isActive?: boolean;
};

export function listLocations(
  params: ListLocationsParams = {},
): Promise<Paginated<LocationPayload>> {
  return getPage<LocationPayload>('/locations', params);
}

/**
 * The locations the **caller** may work in — what the topbar switcher lists.
 *
 * Not `listLocations`: that needs `location:read`, which a POS cashier does not hold, and it
 * returns every warehouse rather than the ones this user is assigned to. This endpoint is
 * self-service and already scoped by the caller's `locationIds`.
 */
export function fetchMyLocations(): Promise<LocationPayload[]> {
  // `silent`: this loads in the topbar on every screen, so a failure must not toast on every
  // navigation about something the user never asked for. The switcher renders nothing instead.
  return getData<LocationPayload[]>('/auth/me/locations', undefined, { silent: true });
}

export interface CreateLocationBody {
  code: string;
  name: string;
  type: LocationType;
  address?: string | null;
  phone?: string | null;
  allowsSales?: boolean;
  allowsPurchase?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * `code` cannot be changed: it is the natural key that stock balances and ledger rows were
 * written against, and renaming it would orphan them.
 */
export type UpdateLocationBody = Partial<Omit<CreateLocationBody, 'code'>>;

export function createLocation(body: CreateLocationBody): Promise<LocationPayload> {
  return postData<LocationPayload>('/locations', body);
}

export function updateLocation(id: string, body: UpdateLocationBody): Promise<LocationPayload> {
  return patchData<LocationPayload>(`/locations/${id}`, body);
}

/** DELETE deactivates — the ledger rows pointing here must keep resolving. */
export function deactivateLocation(id: string): Promise<LocationPayload> {
  return deleteData<LocationPayload>(`/locations/${id}`);
}

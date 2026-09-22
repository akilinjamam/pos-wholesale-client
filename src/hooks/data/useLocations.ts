import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createLocation,
  deactivateLocation,
  fetchMyLocations,
  listLocations,
  updateLocation,
} from '@/api/endpoints/locations';

import type {
  CreateLocationBody,
  ListLocationsParams,
  UpdateLocationBody,
} from '@/api/endpoints/locations';

export const locationKeys = {
  all: ['locations'] as const,
  list: (params: ListLocationsParams) => [...locationKeys.all, 'list', params] as const,
  mine: ['locations', 'mine'] as const,
};

export function useLocations(params: ListLocationsParams = {}) {
  return useQuery({
    queryKey: locationKeys.list(params),
    queryFn: () => listLocations(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * The caller's own accessible locations — the topbar switcher.
 *
 * Long `staleTime` because warehouses are opened roughly never, and this mounts on every page.
 * Creating or deactivating one invalidates `locationKeys.all`, which covers this key too.
 */
export function useMyLocations() {
  return useQuery({
    queryKey: locationKeys.mine,
    queryFn: fetchMyLocations,
    staleTime: 5 * 60_000,
    // No retry: this is chrome. If it fails — an older server without the endpoint, say — the
    // switcher renders nothing and the app carries on, rather than retrying on every screen.
    retry: false,
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateLocationBody) => createLocation(body),
    onSuccess: (location) => {
      void queryClient.invalidateQueries({ queryKey: locationKeys.all });
      toast.success(`${location.name} created`);
    },
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLocationBody }) =>
      updateLocation(id, body),
    onSuccess: (location) => {
      void queryClient.invalidateQueries({ queryKey: locationKeys.all });
      toast.success(`${location.name} updated`);
    },
  });
}

/** Deactivation, not deletion — see the endpoint. */
export function useDeactivateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateLocation(id),
    onSuccess: (location) => {
      void queryClient.invalidateQueries({ queryKey: locationKeys.all });
      toast.success(`${location.name} deactivated`);
    },
  });
}

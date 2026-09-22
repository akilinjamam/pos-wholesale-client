import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { fetchOrg, updateOrg, updateOrgSettings } from '@/api/endpoints/org';

import type { UpdateOrgBody, UpdateOrgSettingsBody } from '@/api/endpoints/org';

export const orgKeys = {
  all: ['org'] as const,
};

export function useOrg() {
  return useQuery({
    queryKey: orgKeys.all,
    queryFn: fetchOrg,
    // The company profile changes a handful of times in the system's life, and its `settings`
    // are read by several screens. Cache it for the session rather than per screen.
    staleTime: 5 * 60_000,
  });
}

export function useUpdateOrg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateOrgBody) => updateOrg(body),
    onSuccess: (org) => {
      // `setQueryData` rather than an invalidate: the response *is* the new org, so there is
      // nothing to go and fetch.
      queryClient.setQueryData(orgKeys.all, org);
      toast.success('Company profile saved');
    },
  });
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateOrgSettingsBody) => updateOrgSettings(body),
    onSuccess: (org) => {
      queryClient.setQueryData(orgKeys.all, org);
      toast.success('Business rules updated');
    },
  });
}

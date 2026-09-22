import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createRole,
  deleteRole,
  fetchPermissionCatalog,
  listRoles,
  updateRole,
} from '@/api/endpoints/roles';
import { userKeys } from '@/hooks/data/useUsers';

import type { CreateRoleBody, ListRolesParams, UpdateRoleBody } from '@/api/endpoints/roles';

export const roleKeys = {
  all: ['roles'] as const,
  list: (params: ListRolesParams) => [...roleKeys.all, 'list', params] as const,
  catalog: ['roles', 'permission-catalog'] as const,
};

export function useRoles(params: ListRolesParams = {}) {
  return useQuery({
    queryKey: roleKeys.list(params),
    queryFn: () => listRoles(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * The permission catalog.
 *
 * `staleTime: Infinity` — it is code on the server, not data: it cannot change without a
 * deploy, and a deploy reloads the page. Refetching it alongside every roles list would be one
 * request per visit for an answer that is fixed for the lifetime of the tab.
 */
export function usePermissionCatalog() {
  return useQuery({
    queryKey: roleKeys.catalog,
    queryFn: fetchPermissionCatalog,
    staleTime: Infinity,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateRoleBody) => createRole(body),
    onSuccess: (role) => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.all });
      toast.success(`Role "${role.name}" created`);
    },
  });
}

/**
 * Editing a role's permissions changes what its holders may do, **now**.
 *
 * The server bumps `tokenVersion` for every user holding the role, so their current tokens stop
 * working on their next request rather than whenever the 15-minute access token happens to
 * expire. Two consequences are handled here:
 *
 *  - The **users list is invalidated** as well as the roles list, because every holder's
 *    effective permission set — which that screen displays — has just changed.
 *  - The toast says how many people are affected. "Saved" understates an edit that is about to
 *    sign four people out.
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRoleBody }) => updateRole(id, body),
    onSuccess: (role, variables) => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.all });
      void queryClient.invalidateQueries({ queryKey: userKeys.all });

      const holders = role.userCount ?? 0;
      if (variables.body.permissions && holders > 0) {
        toast.success(
          `"${role.name}" updated — ${holders} user${holders === 1 ? '' : 's'} must sign in again`,
        );
      } else {
        toast.success(`"${role.name}" updated`);
      }
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.all });
      toast.success('Role deleted');
    },
  });
}

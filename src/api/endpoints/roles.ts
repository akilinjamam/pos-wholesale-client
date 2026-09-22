import { deleteData, getData, getPage, patchData, postData } from '@/api/client';

import type { Permission, PermissionModule } from '@shared/permissions';
import type { Paginated, RolePayload } from '@shared/types';

export type ListRolesParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  isSystem?: boolean;
};

export function listRoles(params: ListRolesParams = {}): Promise<Paginated<RolePayload>> {
  return getPage<RolePayload>('/roles', params);
}

export function getRole(id: string): Promise<RolePayload> {
  return getData<RolePayload>(`/roles/${id}`);
}

/**
 * The permission catalog, grouped and labelled — the rows of the matrix editor.
 *
 * Fetched rather than imported from `@shared/permissions`, even though the client compiles
 * against that very file. The point is to render what the **deployed server** will actually
 * accept: if the two have drifted, the matrix shows the server's catalog and the client cannot
 * offer a permission that would be rejected as unknown on save.
 */
export interface PermissionGroup {
  module: PermissionModule;
  label: string;
  permissions: Permission[];
}

export function fetchPermissionCatalog(): Promise<PermissionGroup[]> {
  return getData<PermissionGroup[]>('/roles/permissions');
}

export interface CreateRoleBody {
  code: string;
  name: string;
  description?: string | null;
  permissions: Permission[];
}

/** `code` is immutable — the seed and every future "is this the cashier role" check use it. */
export type UpdateRoleBody = Partial<Omit<CreateRoleBody, 'code'>>;

export function createRole(body: CreateRoleBody): Promise<RolePayload> {
  return postData<RolePayload>('/roles', body);
}

export function updateRole(id: string, body: UpdateRoleBody): Promise<RolePayload> {
  return patchData<RolePayload>(`/roles/${id}`, body);
}

export function deleteRole(id: string): Promise<void> {
  return deleteData<void>(`/roles/${id}`);
}

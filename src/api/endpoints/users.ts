import { deleteData, getData, getPage, patchData, postData } from '@/api/client';

import type { Permission } from '@shared/permissions';
import type { Paginated, UserPayload } from '@shared/types';

/**
 * The user endpoints.
 *
 * `password` is absent from `UpdateUserBody` on purpose, mirroring the server: it has its own
 * endpoint and its own permission (`user:resetPassword`), because handing over an account is a
 * different act from correcting a phone number. Folding it into the PATCH would give anyone
 * with `user:update` the ability to take over any account.
 */

export type ListUsersParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  roleId?: string;
  locationId?: string;
  isActive?: boolean;
};

export function listUsers(params: ListUsersParams): Promise<Paginated<UserPayload>> {
  return getPage<UserPayload>('/users', params);
}

export function getUser(id: string): Promise<UserPayload> {
  return getData<UserPayload>(`/users/${id}`);
}

export interface CreateUserBody {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  roleIds: string[];
  permissionGrants?: Permission[];
  permissionRevokes?: Permission[];
  /** Empty means unrestricted — how OWNER and ADMIN are modelled. */
  locationIds?: string[];
  defaultLocationId?: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export type UpdateUserBody = Partial<Omit<CreateUserBody, 'password'>>;

export function createUser(body: CreateUserBody): Promise<UserPayload> {
  return postData<UserPayload>('/users', body);
}

export function updateUser(id: string, body: UpdateUserBody): Promise<UserPayload> {
  return patchData<UserPayload>(`/users/${id}`, body);
}

export interface ResetPasswordBody {
  password: string;
  mustChangePassword?: boolean;
}

export function resetUserPassword(id: string, body: ResetPasswordBody): Promise<void> {
  return postData<void>(`/users/${id}/password`, body);
}

/** Deactivates rather than deletes — every document they posted still points at them. */
export function deactivateUser(id: string): Promise<UserPayload> {
  return deleteData<UserPayload>(`/users/${id}`);
}

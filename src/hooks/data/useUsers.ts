import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createUser,
  deactivateUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from '@/api/endpoints/users';

import type {
  CreateUserBody,
  ListUsersParams,
  ResetPasswordBody,
  UpdateUserBody,
} from '@/api/endpoints/users';

/**
 * Server state for users. Nothing here is mirrored into Redux — TanStack owns it.
 *
 * The retail app keeps fetched lists in Redux slices and then has to remember to refetch them
 * after every mutation, which it does inconsistently, so a newly created record appears on some
 * screens and not others until a reload. Here the mutation invalidates the key and every mounted
 * consumer refetches itself.
 */

export const userKeys = {
  all: ['users'] as const,
  list: (params: ListUsersParams) => [...userKeys.all, 'list', params] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

export function useUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => listUsers(params),
    // Keeps the previous page on screen while the next one loads, so paging does not flash an
    // empty table. The DataTable dims the rows via `isFetching` instead.
    placeholderData: (previous) => previous,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserBody) => createUser(body),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(`${user.name} can now sign in`);
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) => updateUser(id, body),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(`${user.name} updated`);
    },
  });
}

/**
 * An administrator resetting someone else's password.
 *
 * The server bumps `tokenVersion`, so every session that user had open is signed out — which is
 * the entire point of a reset and worth saying out loud in the toast, because the administrator
 * is often on the phone to them at the time.
 */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResetPasswordBody }) =>
      resetUserPassword(id, body),
    onSuccess: () => {
      toast.success('Password reset — their other sessions have been signed out');
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(`${user.name} deactivated`);
    },
  });
}

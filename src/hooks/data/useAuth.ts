import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { errorMessage } from '@/api/client';
import {
  changePassword as changePasswordRequest,
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
} from '@/api/endpoints/auth';
import { useAppDispatch, useAppSelector } from '@/app/store';
import {
  selectCurrentUser,
  selectHasPermission,
  signedIn,
  signedOut,
  tokenRefreshed,
  userLoaded,
} from '@/store/authSlice';

import type { ChangePasswordBody, LoginBody } from '@/api/endpoints/auth';
import type { Permission } from '@shared/permissions';

/**
 * Sign in.
 *
 * A mutation rather than a query: it has a side effect, it must not be retried automatically,
 * and it must never be cached. TanStack would happily de-duplicate a repeated query — which
 * for a login attempt would mean a second try with a corrected password silently returning
 * the first attempt's failure.
 */
export function useLogin() {
  const dispatch = useAppDispatch();

  return useMutation({
    mutationFn: (body: LoginBody) => loginRequest(body),
    onSuccess: (data) => {
      dispatch(signedIn({ user: data.user, accessToken: data.accessToken }));
    },
    onError: (error: unknown) => {
      // The axios interceptor stays quiet on 401 (it belongs to the auth layer), so the
      // "email or password is incorrect" message has to be surfaced here.
      toast.error(errorMessage(error));
    },
  });
}

/**
 * Sign out.
 *
 * The local session is cleared whether or not the server call succeeds. If the network is down
 * or the token has already expired, the user still expects the screen to log them out — and
 * leaving them apparently signed in on a shared terminal because a POST failed would be worse
 * than the server keeping a `tokenVersion` it will bump on the next successful call anyway.
 */
export function useLogout() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logoutRequest(),
    onSettled: () => {
      dispatch(signedOut());
      queryClient.clear();
    },
  });
}

/**
 * A user changing their own password.
 *
 * The server bumps `tokenVersion`, which kills every token that account holds — including the
 * pair this browser is using. It hands back a fresh pair for exactly that reason, so the two
 * steps here are not optional bookkeeping: without pushing the new access token into the store,
 * the very next request 401s and the user is signed out by their own successful password
 * change.
 *
 * `/auth/me` is then re-read because `mustChangePassword` has just become false, and the shell
 * reads that flag.
 */
export function useChangePassword() {
  const dispatch = useAppDispatch();

  return useMutation({
    mutationFn: (body: ChangePasswordBody) => changePasswordRequest(body),
    onSuccess: async (tokens) => {
      dispatch(tokenRefreshed(tokens.accessToken));
      try {
        dispatch(userLoaded(await fetchMe()));
      } catch {
        // The token is good — this is only the profile refresh. The shell keeps the previous
        // copy rather than dropping a working session over a failed GET.
      }
      toast.success('Password changed — your other sessions have been signed out');
    },
  });
}

/** The signed-in user, or null. */
export function useCurrentUser() {
  return useAppSelector(selectCurrentUser);
}

/**
 * Whether the current user holds a permission — for hiding a button or a column.
 *
 * Never the thing that protects anything. The server re-derives the effective permission set
 * from the database on every request and answers 403 on its own account; this only decides
 * what is worth drawing.
 */
export function usePermission(permission: Permission | null): boolean {
  return useAppSelector((s) => selectHasPermission(s, permission));
}

/**
 * The same check, as a reusable predicate — for anything that has to test *many* permissions in
 * one render: the sidebar filtering twelve modules, a module landing page filtering its cards,
 * a table deciding which action columns to draw.
 *
 * `usePermission` in a loop is not an option (hooks cannot be called conditionally or in a map),
 * and calling `useAppSelector` per item would subscribe the component once per permission.
 *
 * Memoised on the permissions array, whose identity is stable in the store between auth
 * changes, so the returned function is stable too and can be a dependency.
 */
export function useCan(): (permission: Permission | null) => boolean {
  const permissions = useAppSelector((s) => s.auth.user?.permissions);

  return useMemo(() => {
    const held = new Set<Permission>(permissions ?? []);
    return (permission: Permission | null) => permission === null || held.has(permission);
  }, [permissions]);
}

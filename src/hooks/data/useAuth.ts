import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { errorMessage } from '@/api/client';
import { login as loginRequest, logout as logoutRequest } from '@/api/endpoints/auth';
import { useAppDispatch, useAppSelector } from '@/app/store';
import {
  selectCurrentUser,
  selectHasPermission,
  signedIn,
  signedOut,
} from '@/store/authSlice';

import type { LoginBody } from '@/api/endpoints/auth';
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

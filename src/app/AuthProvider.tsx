import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { registerAuthBridge, setAccessToken } from '@/api/client';
import { fetchMe } from '@/api/endpoints/auth';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { signedOut, tokenRefreshed, userLoaded } from '@/store/authSlice';

import type { ReactNode } from 'react';

/**
 * Bootstraps the session, and connects the axios layer to Redux.
 *
 * Two jobs, both of which have to happen before anything else renders:
 *
 * 1. **Push the persisted token into the axios instance.** The token is held in a module
 *    variable in `api/client.ts`, not read from storage per request, so after a reload nothing
 *    has told axios about it yet. Until it does, every request goes out unauthenticated.
 *
 * 2. **Revalidate against `/auth/me`.** A stored token proves only that someone was signed in
 *    when the tab was last open — it may have expired, the account may have been disabled, or
 *    `tokenVersion` may have been bumped by a role change. The server is the only thing that
 *    knows. If the token is merely expired, the 401 interceptor renews it silently and this
 *    call succeeds on its retry; if it cannot be renewed, the bridge below signs the user out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const status = useAppSelector((s) => s.auth.status);

  // Keep axios in step with the store on every change — login, silent refresh, logout.
  // Synchronous, not in an effect: an effect runs *after* render, leaving a window in which a
  // child's query could fire without the header.
  setAccessToken(accessToken);

  useEffect(() => {
    registerAuthBridge({
      onRefreshed: (token) => dispatch(tokenRefreshed(token)),
      onSignOut: () => {
        dispatch(signedOut());
        // Drop every cached response. Without this, the next person to sign in on this
        // terminal sees the previous user's data until each query happens to refetch — which
        // on a shared counter machine is a real leak, not a cosmetic one.
        queryClient.clear();
      },
    });
  }, [dispatch, queryClient]);

  // Ref rather than a dependency: this must run once per boot. Including `status` would
  // re-enter the moment it flips to 'authenticated'.
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    if (status !== 'authenticating') return;
    bootstrapped.current = true;

    fetchMe()
      .then((user) => dispatch(userLoaded(user)))
      .catch(() => {
        // The interceptor has already tried to refresh and failed, so this token is dead.
        dispatch(signedOut());
      });
  }, [dispatch, status]);

  return <>{children}</>;
}

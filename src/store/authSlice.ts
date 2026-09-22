import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AuthUser } from '@shared/types';
import type { Permission } from '@shared/permissions';

/**
 * Session state only. Server data belongs in TanStack Query — this slice must never become
 * the cross-screen aggregate dumping ground the retail app's `imgModal` slice turned into.
 *
 * What lives here and why:
 *  - `accessToken` — short-lived (15 min), persisted so a page reload does not dump the user
 *    back at the login screen. The **refresh** token is deliberately *not* here: the server
 *    sends it as an httpOnly cookie, out of reach of any script on the page, and putting a
 *    copy in localStorage would throw that protection away.
 *  - `user` — persisted purely so the shell renders instantly on reload instead of flashing a
 *    spinner. It is revalidated against `/auth/me` on every boot and is never trusted for a
 *    permission decision that the server has not already made.
 */

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'anonymous';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
}

const STORAGE_KEY = 'pos-wholesale.auth';

interface PersistedAuth {
  user: AuthUser | null;
  accessToken: string | null;
}

function loadInitial(): AuthState {
  const empty: AuthState = { user: null, accessToken: null, status: 'idle' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...empty, status: 'anonymous' };

    const saved = JSON.parse(raw) as Partial<PersistedAuth>;
    if (!saved.accessToken) return { ...empty, status: 'anonymous' };

    // `authenticating`, not `authenticated`: a persisted token proves only that someone was
    // signed in when this tab was last open. It may have expired, or the account may have been
    // disabled since. AuthProvider decides, by asking the server.
    return {
      user: saved.user ?? null,
      accessToken: saved.accessToken,
      status: 'authenticating',
    };
  } catch {
    // Private windows and blocked site data both throw on read.
    return { ...empty, status: 'anonymous' };
  }
}

function persist(state: AuthState): void {
  try {
    if (!state.accessToken) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: PersistedAuth = { user: state.user, accessToken: state.accessToken };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage is a convenience here; the session still works for as long as the tab is open.
  }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: loadInitial(),
  reducers: {
    signedIn(state, action: PayloadAction<{ user: AuthUser; accessToken: string }>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.status = 'authenticated';
      persist(state);
    },

    /** `/auth/me` came back — the stored user may be stale, the server's answer is not. */
    userLoaded(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = 'authenticated';
      persist(state);
    },

    /** A silent refresh replaced the access token; the identity is unchanged. */
    tokenRefreshed(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
      persist(state);
    },

    signedOut(state) {
      state.user = null;
      state.accessToken = null;
      state.status = 'anonymous';
      persist(state);
    },
  },
});

export const { signedIn, userLoaded, tokenRefreshed, signedOut } = authSlice.actions;
export default authSlice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────────────────────

interface WithAuth {
  auth: AuthState;
}

export const selectAuthStatus = (s: WithAuth): AuthStatus => s.auth.status;
export const selectCurrentUser = (s: WithAuth): AuthUser | null => s.auth.user;
export const selectIsAuthenticated = (s: WithAuth): boolean => s.auth.status === 'authenticated';

/**
 * The client-side permission check.
 *
 * This decides what to *render*. It is never the thing that protects anything — the server
 * re-derives the effective set from the database on every request and answers 403 regardless
 * of what this returns. Hiding a button the server would refuse anyway is a courtesy, not a
 * control.
 */
export function selectHasPermission(s: WithAuth, permission: Permission | null): boolean {
  if (permission === null) return true;
  return s.auth.user?.permissions.includes(permission) ?? false;
}

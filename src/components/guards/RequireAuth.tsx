import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { selectAuthStatus } from '@/store/authSlice';

/**
 * Route-level authentication gate.
 *
 * Used as a layout route, so it decides **before** its children mount. That ordering is the
 * whole point: a child that mounts first fires its queries first, and the user sees a flash of
 * a screen they are about to be redirected away from, plus a burst of 401s in the log.
 *
 * The three states are genuinely different and must not be collapsed:
 *  - `authenticating` — a token was restored from storage and `/auth/me` is in flight. Redirect
 *    here and every page reload bounces a signed-in user through the login screen.
 *  - `anonymous` — no usable session. Redirect.
 *  - `authenticated` — render.
 */
export function RequireAuth() {
  const status = useAppSelector(selectAuthStatus);
  const location = useLocation();

  if (status === 'idle' || status === 'authenticating') {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Restoring your session…</span>
      </div>
    );
  }

  if (status === 'anonymous') {
    // `state.from` so Login can return them to where they were heading. `replace` keeps the
    // guarded URL out of history — otherwise Back lands on it and bounces again.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

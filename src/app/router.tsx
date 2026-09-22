import { createBrowserRouter } from 'react-router-dom';

import { RequireAuth } from '@/components/guards/RequireAuth';
import { RequirePermission } from '@/components/guards/RequirePermission';
import { AppShell } from '@/components/layout/AppShell';
import { ModuleLanding } from '@/components/layout/ModuleLanding';
import { ALL_SCREENS, MODULES } from '@/config/modules';
import { Login } from '@/features/auth/Login';
import { Home } from '@/features/home/Home';
import { ModulePlaceholder } from '@/features/home/ModulePlaceholder';
import { CompanyProfile } from '@/features/settings/Company/CompanyProfile';
import { LocationsList } from '@/features/settings/Locations/LocationsList';
import { RolesList } from '@/features/settings/Roles/RolesList';
import { UsersList } from '@/features/settings/Users/UsersList';

import type { ReactElement } from 'react';

/**
 * Routes are generated from the module registry, so the sidebar and the router can never
 * disagree about what exists — and, because both read the same `permission`, a screen cannot
 * appear in a menu it is not permitted for.
 *
 * The nesting order is the design:
 *
 *     /login                      public
 *     /            RequireAuth    no session → /login, before anything mounts
 *       └ AppShell                the chrome, drawn once
 *           ├ RequirePermission   per module, before the element mounts
 *           └ RequirePermission   per screen — its own permission, not its module's
 *
 * Gating at the route rather than inside the page is what stops the retail app's pattern of
 * rendering a screen, firing its queries, collecting 403s and *then* redirecting with a toast.
 * Here the element never mounts, so no query is ever made.
 *
 * Screens are gated on **their own** permission rather than inheriting the module's. Settings
 * is the case that proves why: it carries `permission: null` so that anyone who can reach one
 * of its four screens gets a landing page, while Users, Roles, Locations and Company each check
 * `user:read`, `role:read`, `location:read` and `org:read` separately.
 */

/**
 * Which component serves which screen path.
 *
 * Kept here rather than in `config/modules.ts` so the registry stays plain data — importable by
 * anything without dragging a dozen feature components into every consumer's bundle. A screen
 * with no entry renders the "coming soon" placeholder, which is how the registry can describe
 * the whole system from Day 1 while the screens arrive over forty days.
 */
const SCREEN_ELEMENTS: Record<string, ReactElement> = {
  '/settings/users': <UsersList />,
  '/settings/roles': <RolesList />,
  '/settings/locations': <LocationsList />,
  '/settings/company': <CompanyProfile />,
};

/** `/settings/users` → `settings/users`, since these are children of the `/` layout route. */
const relative = (path: string) => path.replace(/^\//, '');

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },

  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          // The dashboard carries `permission: null` — every signed-in user has a landing page.
          { index: true, element: <Home /> },

          // Module landing pages. A module with real screens gets the card grid; one whose
          // screens have not been designed yet keeps the Day-1 placeholder.
          ...MODULES.filter((mod) => mod.path !== '/').map((mod) => ({
            path: relative(mod.path),
            element: (
              <RequirePermission permission={mod.permission}>
                {mod.screens.some((s) => !s.comingSoon) ? (
                  <ModuleLanding />
                ) : (
                  <ModulePlaceholder />
                )}
              </RequirePermission>
            ),
          })),

          // The screens themselves.
          ...ALL_SCREENS.filter((screen) => SCREEN_ELEMENTS[screen.path]).map((screen) => ({
            path: relative(screen.path),
            element: (
              <RequirePermission permission={screen.permission}>
                {SCREEN_ELEMENTS[screen.path]}
              </RequirePermission>
            ),
          })),
        ],
      },
    ],
  },
]);

import { createBrowserRouter } from 'react-router-dom';

import { RequireAuth } from '@/components/guards/RequireAuth';
import { RequirePermission } from '@/components/guards/RequirePermission';
import { AppShell } from '@/components/layout/AppShell';
import { MODULES } from '@/config/modules';
import { Login } from '@/features/auth/Login';
import { Home } from '@/features/home/Home';
import { ModulePlaceholder } from '@/features/home/ModulePlaceholder';

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
 *           └ RequirePermission   per module, before the element mounts
 *
 * Gating at the route rather than inside the page is what stops the retail app's pattern of
 * rendering a screen, firing its queries, collecting 403s and *then* redirecting with a toast.
 * Here the element never mounts, so no query is ever made.
 */
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

          ...MODULES.filter((mod) => mod.path !== '/').map((mod) => ({
            path: mod.path.replace(/^\//, ''),
            element: (
              <RequirePermission permission={mod.permission}>
                <ModulePlaceholder />
              </RequirePermission>
            ),
          })),
        ],
      },
    ],
  },
]);

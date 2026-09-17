import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { MODULES } from '@/config/modules';
import { Home } from '@/features/home/Home';
import { ModulePlaceholder } from '@/features/home/ModulePlaceholder';

/**
 * Routes are generated from the module registry, so the sidebar and the router can never
 * disagree about what exists.
 *
 * From Day 3 each module route is wrapped in <RequirePermission permission={mod.permission}>,
 * which gates BEFORE the element mounts — no query fires and there is no redirect flicker.
 * Per-screen child routes are added by each module as it lands.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      ...MODULES.filter((m) => m.path !== '/').map((mod) => ({
        path: mod.path.replace(/^\//, ''),
        element: <ModulePlaceholder />,
      })),
    ],
  },
]);

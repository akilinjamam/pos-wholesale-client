import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useAppDispatch } from '@/app/store';
import { env } from '@/config/env';
import { MODULES } from '@/config/modules';
import { useCan } from '@/hooks/data/useAuth';
import { cn } from '@/lib/utils';
import { toggleSidebar } from '@/store/uiSlice';

import type { ModuleDef, ModuleScreen } from '@/config/modules';

/**
 * The navigation — filtered by what the signed-in user may actually do.
 *
 * **This is the Day-4 deliverable in one component.** In the retail app every menu item is
 * rendered for everyone and the permission check happens (sometimes) inside the screen, so the
 * app advertises capabilities the user does not have and punishes them with a 403 for believing
 * it. Here a module is drawn only when its own permission is held *and* it has at least one
 * screen the user may open, which is why signing in as OWNER, STORE_KEEPER and ACCOUNTS
 * produces three genuinely different sidebars rather than three copies of the same one.
 *
 * The filter reads the same `permission` field the router's guards read, so a menu entry that
 * leads to a refusal is not possible by construction.
 */

interface VisibleModule extends ModuleDef {
  /** Only the screens this user may open. */
  permittedScreens: ModuleScreen[];
}

function useVisibleModules(): VisibleModule[] {
  const can = useCan();

  return useMemo(
    () =>
      MODULES.filter((mod) => can(mod.permission))
        .map((mod) => ({
          ...mod,
          permittedScreens: mod.screens.filter((screen) => can(screen.permission)),
        }))
        // A module whose every screen is out of reach is not a module this user has. The
        // dashboard and Reports declare no screens at all, so they are judged on their own
        // permission alone.
        .filter((mod) => mod.screens.length === 0 || mod.permittedScreens.length > 0),
    [can],
  );
}

export interface SidebarProps {
  /** Icon-only rail. Desktop only — the mobile drawer is always full width. */
  collapsed: boolean;
  /** Called after a nav item is chosen, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /** The collapse toggle is meaningless in the drawer, which is either open or gone. */
  showCollapseToggle?: boolean;
}

export function Sidebar({ collapsed, onNavigate, showCollapseToggle = false }: SidebarProps) {
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const modules = useVisibleModules();

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sm font-bold text-white">
          OW
        </div>
        {!collapsed && <span className="truncate text-sm font-semibold">{env.appName}</span>}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Modules">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isSection = mod.path !== '/' && pathname.startsWith(mod.path);

          return (
            <div key={mod.key}>
              <NavLink
                to={mod.path}
                end={mod.path === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-white/10',
                    (isActive || isSection) && 'bg-sidebar-accent font-medium text-white',
                    collapsed && 'justify-center px-0',
                  )
                }
                title={collapsed ? mod.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{mod.label}</span>}
              </NavLink>

              {/* Sub-items appear only for the section being used. Listing every screen of
                  every module at once turns a twelve-item menu into forty, and the collapsed
                  rail has nowhere to put them at all. */}
              {!collapsed && isSection && mod.permittedScreens.length > 0 && (
                <div className="ml-[1.375rem] mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                  {mod.permittedScreens.map((screen) => (
                    <NavLink
                      key={screen.path}
                      to={screen.path}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'block truncate rounded-md px-3 py-1.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-foreground',
                          isActive && 'bg-white/10 font-medium text-white',
                        )
                      }
                    >
                      {screen.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {showCollapseToggle && (
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/10"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}

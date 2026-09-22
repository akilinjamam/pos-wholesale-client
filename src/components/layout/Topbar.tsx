import { Menu } from 'lucide-react';
import { forwardRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { LocationSwitcher } from '@/components/layout/LocationSwitcher';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import { moduleForPath, screenForPath } from '@/config/modules';

import type { Theme } from '@/store/uiSlice';

/**
 * The bar above every screen: where you are, where you are working, and who you are.
 *
 * The breadcrumb is derived from the module registry rather than from the URL's segments, so it
 * reads "Settings › Roles" instead of "settings › roles" and stays correct when a path and its
 * label diverge. Both parts come from the same registry that built the sidebar, so the two can
 * never disagree about what a screen is called.
 *
 * `ref` is the mobile drawer's trigger: AppShell owns the drawer's open state and needs the
 * button back to return focus when it closes.
 */
export interface TopbarProps {
  theme: Theme;
  onOpenNav: () => void;
  navOpen: boolean;
}

export const Topbar = forwardRef<HTMLButtonElement, TopbarProps>(
  ({ theme, onOpenNav, navOpen }, ref) => {
    const { pathname } = useLocation();

    const mod = moduleForPath(pathname);
    const screen = screenForPath(pathname);

    return (
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            ref={ref}
            variant="ghost"
            size="icon"
            className="-ml-2 md:hidden"
            onClick={onOpenNav}
            aria-label="Open navigation"
            aria-expanded={navOpen}
          >
            <Menu />
          </Button>

          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              <li className="min-w-0">
                {/* The module is a link only when we are below it — a breadcrumb whose last
                    item links to the page you are on is a dead control. */}
                {screen && mod ? (
                  <Link
                    to={mod.path}
                    className="truncate text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {mod.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{mod?.label ?? 'Dashboard'}</span>
                )}
              </li>

              {screen && (
                <>
                  <li aria-hidden="true" className="text-muted-foreground">
                    ›
                  </li>
                  <li className="min-w-0">
                    <span className="truncate font-medium" aria-current="page">
                      {screen.label}
                    </span>
                  </li>
                </>
              )}
            </ol>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <LocationSwitcher />
          <UserMenu theme={theme} />
        </div>
      </header>
    );
  },
);
Topbar.displayName = 'Topbar';

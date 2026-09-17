import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAppDispatch, useAppSelector } from '@/app/store';
import { Button } from '@/components/ui/button';
import { env } from '@/config/env';
import { MODULES } from '@/config/modules';
import { cn } from '@/lib/utils';
import { toggleSidebar, toggleTheme } from '@/store/uiSlice';

/** Tailwind's `md`. Below this the sidebar is an off-canvas drawer, not a fixed rail. */
const MD_BREAKPOINT = '(min-width: 768px)';

interface SidebarContentProps {
  /** Icon-only rail. Desktop only — the mobile drawer is always full width. */
  collapsed: boolean;
  /** Called after a nav item is chosen, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /** The collapse toggle is meaningless in the drawer, which is either open or gone. */
  showCollapseToggle?: boolean;
}

/**
 * The sidebar's contents, rendered twice: once in the desktop rail, once inside the mobile
 * drawer. Extracted so the nav never drifts between the two.
 */
function SidebarContent({
  collapsed,
  onNavigate,
  showCollapseToggle = false,
}: SidebarContentProps) {
  const dispatch = useAppDispatch();

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sm font-bold text-white">
          OW
        </div>
        {!collapsed && <span className="truncate text-sm font-semibold">{env.appName}</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <NavLink
              key={mod.key}
              to={mod.path}
              end={mod.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  'hover:bg-white/10',
                  isActive && 'bg-sidebar-accent font-medium text-white',
                  collapsed && 'justify-center px-0',
                )
              }
              title={collapsed ? mod.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{mod.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {showCollapseToggle && (
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/10"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}

export function AppShell() {
  const dispatch = useAppDispatch();
  const { theme, sidebarCollapsed } = useAppSelector((s) => s.ui);
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  /**
   * Which route the drawer was opened on, or null for closed.
   *
   * Transient by design, so local state rather than Redux: a drawer that reopened itself
   * after a page reload because the flag was persisted would be a bug, not a feature.
   *
   * Storing the pathname instead of a boolean makes "close on navigation" a derivation
   * rather than an effect that syncs one piece of state from another. It closes on browser
   * back/forward too, not just on taps inside the drawer.
   */
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const mobileOpen = openedAtPath !== null && openedAtPath === location.pathname;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const closeMobile = useCallback(() => setOpenedAtPath(null), []);

  // The theme lives on <html> so Tailwind's `dark:` variants and the CSS variables in
  // globals.css both see it.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Rotating to landscape or resizing past `md` reveals the desktop rail; leaving the drawer
  // mounted would stack two sidebars and strand the scroll lock.
  useEffect(() => {
    const mql = window.matchMedia(MD_BREAKPOINT);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpenedAtPath(null);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Escape closes, and the page behind must not scroll while the drawer is over it.
  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobile();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the drawer so keyboard and screen-reader users land where the visual
    // focus went, and return it to the trigger on close. Captured now, because by cleanup
    // time the ref may already point somewhere else.
    const trigger = triggerRef.current;
    drawerRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [mobileOpen, closeMobile]);

  const currentModule = MODULES.find((m) => m.path === location.pathname)?.label ?? 'Dashboard';

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop rail: hidden below md, where the drawer takes over ── */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarContent collapsed={sidebarCollapsed} showCollapseToggle />
      </aside>

      {/* ── Mobile drawer: mounted only while open, so its links are not reachable by
             keyboard when it is off-screen ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.button
              type="button"
              aria-label="Close navigation"
              onClick={closeMobile}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-sm"
            />

            <motion.div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main navigation"
              tabIndex={-1}
              initial={reduceMotion ? false : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl outline-none"
            >
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Close navigation"
                className="absolute right-2 top-3 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Never collapsed: an icon-only rail makes no sense inside a drawer. */}
              <SidebarContent collapsed={false} onNavigate={closeMobile} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              ref={triggerRef}
              variant="ghost"
              size="icon"
              className="-ml-2 md:hidden"
              onClick={() => setOpenedAtPath(location.pathname)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <Menu />
            </Button>
            <span className="truncate text-sm text-muted-foreground">{currentModule}</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch(toggleTheme())}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          >
            {theme === 'light' ? <Moon /> : <Sun />}
          </Button>
        </header>

        {/* Route transition — one of the few places motion earns its place. */}
        <motion.main
          key={location.pathname}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex-1 p-4 md:p-6"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}

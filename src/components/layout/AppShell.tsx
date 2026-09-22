import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { cn } from '@/lib/utils';

/** Tailwind's `md`. Below this the sidebar is an off-canvas drawer, not a fixed rail. */
const MD_BREAKPOINT = '(min-width: 768px)';

/**
 * The chrome, drawn once around every authenticated screen.
 *
 * Its own job is now only the *shell*: the rail, the drawer and the route transition. The
 * navigation moved to `Sidebar` (which filters by permission) and the header to `Topbar`, so
 * this file is about layout and nothing else — and the two pieces that have real logic can be
 * read without wading through drawer mechanics.
 */
export function AppShell() {
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

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop rail: hidden below md, where the drawer takes over ── */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        <Sidebar collapsed={sidebarCollapsed} showCollapseToggle />
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
                <X className="h-4 w-4" aria-hidden="true" />
              </button>

              {/* Never collapsed: an icon-only rail makes no sense inside a drawer. */}
              <Sidebar collapsed={false} onNavigate={closeMobile} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          ref={triggerRef}
          theme={theme}
          navOpen={mobileOpen}
          onOpenNav={() => setOpenedAtPath(location.pathname)}
        />

        {/*
          Route transition — one of the few places motion earns its place.

          `key` on the pathname remounts the fade per route. `AnimatePresence` is deliberately
          NOT used here: an exit animation keeps the old screen mounted while the new one
          mounts, which on a data screen means both pages' queries are live at once and the
          scroll position lands somewhere between them. A fade-in with no fade-out is the
          honest version of this effect.
        */}
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

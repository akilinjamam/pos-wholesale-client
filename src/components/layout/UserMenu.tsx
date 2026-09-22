import { KeyRound, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useState } from 'react';

import { useAppDispatch } from '@/app/store';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { useCurrentUser, useLogout } from '@/hooks/data/useAuth';
import { toggleTheme, type Theme } from '@/store/uiSlice';

/**
 * Who is signed in, and everything that account can do to itself.
 *
 * The permission count is not decoration. When a screen is missing, the first question is
 * always "what am I allowed to do?", and until Day 4 the only way to answer it was to read a
 * JWT. Showing the roles and the size of the effective set turns "the app is broken" into "I
 * have the wrong role", which is a support call that ends in a minute rather than an hour.
 */
export function UserMenu({ theme }: { theme: Theme }) {
  const dispatch = useAppDispatch();
  const user = useCurrentUser();
  const logout = useLogout();
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <>
      <Dropdown
        className="w-64"
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Account menu"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="hidden min-w-0 max-w-[10rem] text-left sm:block">
              <span className="block truncate text-sm font-medium leading-tight">
                {user.name}
              </span>
              <span className="block truncate text-xs leading-tight text-muted-foreground">
                {user.roleCodes.join(', ') || 'No role'}
              </span>
            </span>
          </button>
        )}
      >
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>

        <DropdownSeparator />

        <div className="flex items-start gap-2 px-2 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {user.roleCodes.join(', ') || 'No role'}
            <span className="block">
              {user.permissions.length} permission{user.permissions.length === 1 ? '' : 's'}
              {user.locationIds.length === 0
                ? ' · all locations'
                : ` · ${user.locationIds.length} location${user.locationIds.length === 1 ? '' : 's'}`}
            </span>
          </span>
        </div>

        <DropdownSeparator />

        <DropdownItem onClick={() => setPasswordOpen(true)}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Change password
        </DropdownItem>

        <DropdownItem onClick={() => dispatch(toggleTheme())}>
          {theme === 'light' ? (
            <Moon className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Sun className="h-4 w-4" aria-hidden="true" />
          )}
          {theme === 'light' ? 'Dark theme' : 'Light theme'}
        </DropdownItem>

        <DropdownSeparator />

        <DropdownItem destructive onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownItem>
      </Dropdown>

      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}

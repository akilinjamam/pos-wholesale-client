import { LogOut, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCurrentUser, useLogout } from '@/hooks/data/useAuth';
import { toggleTheme, type Theme } from '@/store/uiSlice';
import { useAppDispatch } from '@/app/store';

/**
 * Who is signed in, and the way out.
 *
 * Deliberately a plain chip plus a button rather than a dropdown: the full user menu — location
 * switcher, profile, change password — lands on Day 4 with the rest of the Topbar. This exists
 * so the session is visible and can be ended, which is what makes the Day 3 flow testable.
 */
export function UserMenu({ theme }: { theme: Theme }) {
  const dispatch = useAppDispatch();
  const user = useCurrentUser();
  const logout = useLogout();

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex items-center gap-2">
      <div className="hidden min-w-0 text-right sm:block">
        <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
        <p className="truncate text-xs leading-tight text-muted-foreground">
          {user.roleCodes.join(', ') || 'No role'}
        </p>
      </div>

      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
        aria-hidden="true"
      >
        {initials}
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
      <Button
        variant="ghost"
        size="icon"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut />
      </Button>
    </div>
  );
}

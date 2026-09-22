import { ShieldOff } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { buttonVariants } from '@/components/ui/button';
import { selectHasPermission } from '@/store/authSlice';

import type { Permission } from '@shared/permissions';
import type { ReactNode } from 'react';

/**
 * Route-level permission gate.
 *
 * **It refuses rather than redirects.** A redirect to the dashboard leaves the user staring at
 * a page they did not ask for with no explanation, and it makes a mistyped URL and a genuine
 * lack of access look identical. This says what happened.
 *
 * More importantly, the guarded element **never mounts**, so its queries never fire. The retail
 * app checks permissions inside the page, which means the screen renders, fires its requests,
 * collects a row of 403s, and only then redirects — with a toast on the way out.
 *
 * This decides what to *draw*. It is not a security boundary: the server re-derives the
 * effective permission set from the database on every request and answers 403 regardless of
 * what the client believes. Someone who edits their localStorage gets a menu full of screens
 * that all return 403.
 */
interface RequirePermissionProps {
  /** `null` means "no permission needed" — the dashboard, for instance. */
  permission: Permission | null;
  /** Given for a wrapped element; omitted when used as a layout route with an `<Outlet/>`. */
  children?: ReactNode;
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const allowed = useAppSelector((s) => selectHasPermission(s, permission));

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <h1 className="text-lg font-semibold">You do not have access to this screen</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            It needs the{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{permission}</code>{' '}
            permission. Ask an administrator to add it to your role.
          </p>
        </div>

        {/* `buttonVariants` rather than <Button>, because this project's Button is a plain
            <button> with no Radix `asChild` to slot a router Link into. */}
        <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <>{children ?? <Outlet />}</>;
}

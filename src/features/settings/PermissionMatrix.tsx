import { Loader2, Minus, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { usePermissionCatalog } from '@/hooks/data/useRoles';
import { cn } from '@/lib/utils';

import type { Permission } from '@shared/permissions';

/**
 * The permission editor — a checkbox grid grouped by module.
 *
 * It serves two screens that look the same and mean different things, which is why `baseline`
 * exists:
 *
 *  - **Roles.** No baseline. The ticks *are* the role's permission set.
 *  - **Users.** The baseline is what the user's roles already grant. The ticks are their
 *    **effective** set, and every tick that disagrees with the baseline is an individual
 *    override — a grant where the roles give nothing, a revoke where they give it. The caller
 *    derives `permissionGrants` / `permissionRevokes` by differencing the two, so an
 *    administrator edits the thing they actually care about ("can this person do X?") rather
 *    than reasoning about two exception lists in their head.
 *
 * The deviations are labelled inline, because an override is a liability: it survives role
 * changes, it is invisible on the roles screen, and six months later nobody remembers why one
 * storekeeper can post credit notes.
 *
 * The catalog comes from the server (`GET /roles/permissions`) rather than from the imported
 * `@shared/permissions`, so the grid can only offer permissions the deployed server will accept.
 */

export interface PermissionMatrixProps {
  /** The ticked set. For a user, this is their effective permissions. */
  value: Permission[];
  onChange: (next: Permission[]) => void;
  /** What the user's roles already grant. Omit on the roles screen. */
  baseline?: readonly Permission[];
  disabled?: boolean;
}

export function PermissionMatrix({
  value,
  onChange,
  baseline,
  disabled = false,
}: PermissionMatrixProps) {
  const { data: groups, isLoading } = usePermissionCatalog();
  const [filter, setFilter] = useState('');

  const selected = useMemo(() => new Set(value), [value]);
  const base = useMemo(() => new Set(baseline ?? []), [baseline]);

  const needle = filter.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!groups) return [];
    if (!needle) return groups;

    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (p) => p.includes(needle) || group.label.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [groups, needle]);

  const setMany = (permissions: readonly Permission[], on: boolean) => {
    const next = new Set(selected);
    for (const permission of permissions) {
      if (on) next.add(permission);
      else next.delete(permission);
    }
    onChange([...next]);
  };

  const toggle = (permission: Permission) => {
    setMany([permission], !selected.has(permission));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading the permission catalog…
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        The server returned no permissions.
      </p>
    );
  }

  const allPermissions = groups.flatMap((g) => g.permissions);
  const overrideCount = baseline
    ? allPermissions.filter((p) => selected.has(p) !== base.has(p)).length
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter permissions…"
            className="pl-9"
            aria-label="Filter permissions"
          />
        </div>

        <span className="text-sm text-muted-foreground">
          {selected.size} of {allPermissions.length}
        </span>

        {!disabled && (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setMany(
                  visibleGroups.flatMap((g) => g.permissions),
                  true,
                )
              }
            >
              <Plus aria-hidden="true" />
              All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setMany(
                  visibleGroups.flatMap((g) => g.permissions),
                  false,
                )
              }
            >
              <Minus aria-hidden="true" />
              None
            </Button>
          </div>
        )}
      </div>

      {baseline && overrideCount > 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {overrideCount} individual override{overrideCount === 1 ? '' : 's'} — these apply to
          this user only and survive any change to their roles.
        </p>
      )}

      <div className="space-y-3">
        {visibleGroups.map((group) => {
          const inGroup = group.permissions;
          const chosen = inGroup.filter((p) => selected.has(p)).length;
          const allChosen = chosen === inGroup.length && inGroup.length > 0;

          return (
            <div key={group.module} className="rounded-lg border">
              <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2">
                <Checkbox
                  checked={allChosen}
                  indeterminate={chosen > 0 && !allChosen}
                  onChange={() => setMany(inGroup, !allChosen)}
                  disabled={disabled}
                  aria-label={`All ${group.label} permissions`}
                  id={`group-${group.module}`}
                />
                <label
                  htmlFor={`group-${group.module}`}
                  className="flex-1 cursor-pointer text-sm font-medium"
                >
                  {group.label}
                </label>
                <span className="text-xs text-muted-foreground">
                  {chosen}/{inGroup.length}
                </span>
              </div>

              <div className="grid gap-x-4 gap-y-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {inGroup.map((permission) => {
                  const checked = selected.has(permission);
                  const fromRole = base.has(permission);
                  const granted = Boolean(baseline) && checked && !fromRole;
                  const revoked = Boolean(baseline) && !checked && fromRole;

                  return (
                    <label
                      key={permission}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm transition-colors hover:bg-accent',
                        disabled && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => toggle(permission)}
                        disabled={disabled}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {permission}
                      </span>
                      {granted && (
                        <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                          granted
                        </Badge>
                      )}
                      {revoked && (
                        <Badge
                          variant="destructive"
                          className="shrink-0 px-1.5 py-0 text-[10px]"
                        >
                          revoked
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        {visibleGroups.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No permission matches “{filter}”.
          </p>
        )}
      </div>
    </div>
  );
}

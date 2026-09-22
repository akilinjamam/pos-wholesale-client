import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { errorMessage, fieldErrors } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PermissionMatrix } from '@/features/settings/PermissionMatrix';
import { usePermission } from '@/hooks/data/useAuth';
import { useLocations } from '@/hooks/data/useLocations';
import { useRoles } from '@/hooks/data/useRoles';
import { useCreateUser, useUpdateUser } from '@/hooks/data/useUsers';
import { cn } from '@/lib/utils';

import { effectivePermissions } from '@shared/permissions';

import type { Permission } from '@shared/permissions';
import type { UserPayload } from '@shared/types';

/**
 * Create or edit a user.
 *
 * The part worth reading is the permission model at the bottom.
 *
 * A user's effective set is `union(roles) ∪ grants \ revokes`, and the naive editor asks an
 * administrator to maintain `grants` and `revokes` directly — two exception lists whose
 * consequence, combined with three roles, nobody can hold in their head. So this screen keeps
 * the exception lists as its state and shows the **result**: the matrix is ticked with the
 * effective set, and un-ticking something the roles grant records a revoke, while ticking
 * something they do not records a grant.
 *
 * The derivation uses `effectivePermissions` from `@shared/permissions` — the same function the
 * server uses at login and on every request. That is the point of it being shared: the preview
 * cannot disagree with what the user will actually get.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  email: z.string().trim().email('Not a valid email address'),
  phone: z.string().trim().max(40).optional(),
  // Create only; `.optional()` and checked against the mode in `superRefine` below would be
  // heavier than simply validating it in the submit handler, since the server owns the rule.
  password: z.string().optional(),
  defaultLocationId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export interface UserEditorProps {
  open: boolean;
  onClose: () => void;
  /** Null creates. */
  user: UserPayload | null;
}

export function UserEditor({ open, onClose, user }: UserEditorProps) {
  const canReadRoles = usePermission('role:read');
  const canReadLocations = usePermission('location:read');

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const pending = createUser.isPending || updateUser.isPending;

  const { data: rolesPage } = useRoles(canReadRoles ? { limit: 200 } : {});
  const { data: locationsPage } = useLocations(
    canReadLocations ? { limit: 200, isActive: true } : {},
  );

  // Memoised because `baseline` below depends on them: `?? []` is a new array on every render,
  // which would make the permission preview recompute on every keystroke in the name field.
  const roles = useMemo(() => rolesPage?.items ?? [], [rolesPage]);
  const locations = useMemo(() => locationsPage?.items ?? [], [locationsPage]);

  // All initialised at mount. `UsersList` gives this component a fresh `key` per open, so a
  // mount is an open — no effect copying props into state, and no re-render on every open.
  const [roleIds, setRoleIds] = useState<string[]>(user?.roleIds ?? []);
  const [locationIds, setLocationIds] = useState<string[]>(user?.locationIds ?? []);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [mustChangePassword, setMustChangePassword] = useState(
    user ? user.mustChangePassword : true,
  );
  const [grants, setGrants] = useState<Permission[]>(user?.permissionGrants ?? []);
  const [revokes, setRevokes] = useState<Permission[]>(user?.permissionRevokes ?? []);
  // Open the section straight away when there is already something in it to see.
  const [showOverrides, setShowOverrides] = useState(
    (user?.permissionGrants.length ?? 0) + (user?.permissionRevokes.length ?? 0) > 0,
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      defaultLocationId: user?.defaultLocationId ?? '',
    },
    mode: 'onTouched',
  });

  /** What the chosen roles grant, before any individual override. */
  const baseline = useMemo(() => {
    const chosen = new Set(roleIds);
    const fromRoles = roles.filter((r) => chosen.has(r.id)).flatMap((r) => r.permissions);
    return effectivePermissions(fromRoles);
  }, [roleIds, roles]);

  /** What this user will actually be able to do — the same computation the server runs. */
  const effective = useMemo(
    () => effectivePermissions(baseline, grants, revokes),
    [baseline, grants, revokes],
  );

  /**
   * The matrix hands back the desired *effective* set; the overrides are the difference from
   * the roles' baseline. Storing it this way round means changing a role re-derives the
   * effective set automatically and keeps the deliberate exceptions intact.
   */
  const onPermissionsChange = (next: Permission[]) => {
    const wanted = new Set(next);
    const base = new Set(baseline);

    setGrants(next.filter((p) => !base.has(p)));
    setRevokes(baseline.filter((p) => !wanted.has(p)));
  };

  const toggleId = (id: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const applyFieldErrors = (error: unknown) => {
    const fields = fieldErrors(error);
    const known = new Set(['name', 'email', 'phone', 'password', 'defaultLocationId']);
    let handled = false;

    for (const field of fields) {
      // Server paths for the array fields are `roleIds`/`locationIds`, which have no registered
      // input — those surface as a toast instead of vanishing.
      if (known.has(field.path)) {
        form.setError(field.path as keyof FormValues, { message: field.message });
        handled = true;
      }
    }
    if (!handled) toast.error(errorMessage(error));
  };

  const onSubmit = form.handleSubmit((values) => {
    if (roleIds.length === 0) {
      toast.error('A user needs at least one role');
      return;
    }
    if (!user && (values.password ?? '').length < 8) {
      form.setError('password', { message: 'At least 8 characters' });
      return;
    }

    const common = {
      name: values.name,
      email: values.email,
      phone: values.phone?.length ? values.phone : null,
      roleIds,
      permissionGrants: grants,
      permissionRevokes: revokes,
      locationIds,
      // An unrestricted user has no default location to speak of, and the server rejects a
      // default that is not in a non-empty `locationIds`.
      defaultLocationId:
        values.defaultLocationId && locationIds.includes(values.defaultLocationId)
          ? values.defaultLocationId
          : null,
      isActive,
      mustChangePassword,
    };

    if (user) {
      updateUser.mutate(
        { id: user.id, body: common },
        { onSuccess: onClose, onError: applyFieldErrors },
      );
    } else {
      createUser.mutate(
        { ...common, password: values.password ?? '' },
        { onSuccess: onClose, onError: applyFieldErrors },
      );
    }
  });

  const unrestricted = locationIds.length === 0;
  const overrideCount = grants.length + revokes.length;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={user ? `Edit ${user.name}` : 'New user'}
      description={
        user
          ? 'Changing roles, overrides, locations or status signs this user out of every device.'
          : 'The account can sign in as soon as it is created.'
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {user ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => <Input {...props} {...form.register('name')} autoComplete="off" />}
          </Field>

          <Field label="Email" required error={form.formState.errors.email?.message}>
            {(props) => (
              <Input {...props} {...form.register('email')} type="email" autoComplete="off" />
            )}
          </Field>

          <Field label="Phone" error={form.formState.errors.phone?.message}>
            {(props) => <Input {...props} {...form.register('phone')} autoComplete="off" />}
          </Field>

          {!user && (
            <Field
              label="Password"
              required
              hint="At least 8 characters."
              error={form.formState.errors.password?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('password')}
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </Field>
          )}
        </section>

        <section className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={mustChangePassword} onCheckedChange={setMustChangePassword} />
            Must change password at next sign-in
          </label>
        </section>

        {/* ── Roles ── */}
        <section className="space-y-2">
          <p className="text-sm font-medium">
            Roles <span className="text-destructive">*</span>
          </p>

          {!canReadRoles ? (
            <p className="text-sm text-muted-foreground">
              You cannot list roles, so they cannot be changed here.
            </p>
          ) : (
            <div className="grid gap-1 rounded-lg border p-3 sm:grid-cols-2">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={roleIds.includes(role.id)}
                    onChange={() => toggleId(role.id, roleIds, setRoleIds)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{role.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {role.permissions.length} permissions
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* ── Locations ── */}
        <section className="space-y-2">
          <p className="text-sm font-medium">Locations</p>

          {!canReadLocations ? (
            <p className="text-sm text-muted-foreground">
              You cannot list locations, so they cannot be changed here.
            </p>
          ) : (
            <>
              <div className="grid gap-1 rounded-lg border p-3 sm:grid-cols-2">
                {locations.map((location) => (
                  <label
                    key={location.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={locationIds.includes(location.id)}
                      onChange={() => toggleId(location.id, locationIds, setLocationIds)}
                    />
                    <span className="min-w-0 flex-1 truncate">{location.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {location.code}
                    </span>
                  </label>
                ))}
              </div>

              <p
                className={cn(
                  'text-xs',
                  unrestricted ? 'text-warning' : 'text-muted-foreground',
                )}
              >
                {unrestricted
                  ? 'None selected — this user may act in every location. That is how OWNER and ADMIN are modelled; for anyone else, choose their warehouses.'
                  : 'Requests naming any other location are refused by the server.'}
              </p>

              {!unrestricted && (
                <Field label="Default location">
                  {(props) => (
                    <Select
                      {...props}
                      {...form.register('defaultLocationId')}
                      placeholder="No default"
                      className="max-w-xs"
                    >
                      {locations
                        .filter((l) => locationIds.includes(l.id))
                        .map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
              )}
            </>
          )}
        </section>

        {/* ── Effective permissions ──
             Hidden without `role:read`: the matrix renders the catalog from
             `GET /roles/permissions`, which is gated on it, and the baseline it compares
             against comes from the roles list. Without both, the grid would show every
             permission as an override. */}
        <section className={cn('space-y-2', !canReadRoles && 'hidden')}>
          <button
            type="button"
            onClick={() => setShowOverrides((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md text-left text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={showOverrides}
          >
            {showOverrides ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
            Permissions
            <span className="font-normal text-muted-foreground">
              — {effective.length} effective
              {overrideCount > 0 &&
                `, ${overrideCount} individual override${overrideCount === 1 ? '' : 's'}`}
            </span>
          </button>

          {showOverrides && canReadRoles && (
            <>
              <p className="text-xs text-muted-foreground">
                Ticked is what this user will be able to do. Anything that differs from what
                their roles grant is recorded as an individual exception — prefer changing the
                role where you can, because an override is invisible from the roles screen.
              </p>
              <PermissionMatrix
                value={effective}
                onChange={onPermissionsChange}
                baseline={baseline}
              />
            </>
          )}
        </section>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { errorMessage, fieldErrors } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PermissionMatrix } from '@/features/settings/PermissionMatrix';
import { useCreateRole, useUpdateRole } from '@/hooks/data/useRoles';

import type { Permission } from '@shared/permissions';
import type { RolePayload } from '@shared/types';

/**
 * Mirrors the server's `createRoleSchema`. `code` is upper-cased on the way out because the
 * server does the same, and a field that silently rewrites what you typed after you save is
 * unsettling.
 */
const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'At least 2 characters')
    .max(40)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Letters, digits and underscores; start with a letter'),
  name: z.string().trim().min(1, 'Required').max(80),
  description: z.string().trim().max(300).optional(),
});

type FormValues = z.infer<typeof schema>;

export interface RoleEditorProps {
  open: boolean;
  onClose: () => void;
  /** Null creates. A system role is editable, but its `code` is not. */
  role: RolePayload | null;
}

/**
 * Give this a new `key` on every open — `RolesList` does. The dialog stays mounted while it
 * closes so its exit animation can run, and remounts on the next open, which is what makes the
 * form start clean without an effect that copies props into state.
 */

export function RoleEditor({ open, onClose, role }: RoleEditorProps) {
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const pending = createRole.isPending || updateRole.isPending;

  /**
   * Permissions live outside react-hook-form.
   *
   * RHF is built around inputs that emit events; a 200-checkbox grid driven through it means
   * either 200 registered fields or a `setValue` on every click with `shouldDirty` bookkeeping.
   * An array in local state is the honest model — and the matrix already takes `value`/`onChange`.
   */
  const [permissions, setPermissions] = useState<Permission[]>(role?.permissions ?? []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Initialised at mount, with no resetting effect. The caller gives this component a fresh
    // `key` each time the editor is opened, so a mount *is* an open — which is React's own
    // answer to "reset state when the input changes" and avoids a setState-in-effect that
    // would re-render every open.
    defaultValues: {
      code: role?.code ?? '',
      name: role?.name ?? '',
      description: role?.description ?? '',
    },
    mode: 'onTouched',
  });

  const applyFieldErrors = (error: unknown) => {
    const fields = fieldErrors(error);
    for (const field of fields) {
      if (field.path === 'code' || field.path === 'name' || field.path === 'description') {
        form.setError(field.path, { message: field.message });
      }
    }
    if (fields.length === 0) toast.error(errorMessage(error));
  };

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      name: values.name,
      description: values.description?.length ? values.description : null,
      permissions,
    };

    if (role) {
      updateRole.mutate(
        { id: role.id, body },
        { onSuccess: onClose, onError: applyFieldErrors },
      );
    } else {
      createRole.mutate(
        { ...body, code: values.code.toUpperCase() },
        { onSuccess: onClose, onError: applyFieldErrors },
      );
    }
  });

  const holders = role?.userCount ?? 0;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={role ? `Edit ${role.name}` : 'New role'}
      description={
        role && holders > 0
          ? `${holders} user${holders === 1 ? '' : 's'} hold this role. Saving a permission change signs them out, and they see the new menu when they sign back in.`
          : 'A role is a named set of permissions. Users can hold more than one.'
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {role ? 'Save changes' : 'Create role'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code"
            required
            error={form.formState.errors.code?.message}
            hint={
              role
                ? 'Fixed — the seed and the system refer to roles by code.'
                : 'Upper case, e.g. WAREHOUSE_LEAD.'
            }
          >
            {(props) => (
              <Input
                {...props}
                {...form.register('code')}
                // Immutable after creation: users reference roles by id, but the seed, the
                // tests and every "is this the cashier role" check reference them by code.
                disabled={Boolean(role)}
                className="font-mono uppercase"
                placeholder="WAREHOUSE_LEAD"
              />
            )}
          </Field>

          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => (
              <Input {...props} {...form.register('name')} placeholder="Warehouse Lead" />
            )}
          </Field>
        </div>

        <Field label="Description" error={form.formState.errors.description?.message}>
          {(props) => (
            <Textarea
              {...props}
              {...form.register('description')}
              rows={2}
              placeholder="What this role is for, and what it deliberately cannot do."
            />
          )}
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium">Permissions</p>
          <PermissionMatrix value={permissions} onChange={setPermissions} />
        </div>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

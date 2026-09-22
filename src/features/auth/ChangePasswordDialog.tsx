import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { errorMessage, fieldErrors } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useChangePassword } from '@/hooks/data/useAuth';

/**
 * A user changing their own password.
 *
 * Mirrors the server's `changePasswordSchema` — including the "must be different" rule — so the
 * obvious mistakes are caught before a round trip. The server still validates: this is a
 * convenience, not the check.
 */
const schema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters').max(128),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'The new password must be different',
  })
  // Client-side only: the server never sees the confirmation. Catching a typo here is the whole
  // point — a mistyped new password that is accepted locks the user out of their own account.
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match',
  });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const changePassword = useChangePassword();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const close = () => {
    form.reset();
    onClose();
  };

  const onSubmit = form.handleSubmit((values) => {
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: close,
        onError: (error) => {
          // The server's 422 names the field — "that is not your current password" belongs
          // under that input, not in a toast the user has to map back to a box.
          const fields = fieldErrors(error);
          for (const field of fields) {
            if (field.path === 'currentPassword' || field.path === 'newPassword') {
              form.setError(field.path, { message: field.message });
            }
          }
          if (fields.length === 0) toast.error(errorMessage(error));
          form.setFocus(fields[0]?.path === 'newPassword' ? 'newPassword' : 'currentPassword');
        },
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Change your password"
      description="Every other session on this account will be signed out."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={changePassword.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={changePassword.isPending}>
            {changePassword.isPending && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            Change password
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Current password"
          required
          error={form.formState.errors.currentPassword?.message}
        >
          {(props) => (
            <Input
              {...props}
              {...form.register('currentPassword')}
              type="password"
              autoComplete="current-password"
            />
          )}
        </Field>

        <Field
          label="New password"
          required
          hint="At least 8 characters."
          error={form.formState.errors.newPassword?.message}
        >
          {(props) => (
            <Input
              {...props}
              {...form.register('newPassword')}
              type="password"
              autoComplete="new-password"
            />
          )}
        </Field>

        <Field
          label="Confirm new password"
          required
          error={form.formState.errors.confirmPassword?.message}
        >
          {(props) => (
            <Input
              {...props}
              {...form.register('confirmPassword')}
              type="password"
              autoComplete="new-password"
            />
          )}
        </Field>

        {/* A submit button inside the form, so Enter submits — the footer's button is outside
            it, in the dialog's action row. */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

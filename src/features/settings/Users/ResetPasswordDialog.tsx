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
import { Switch } from '@/components/ui/switch';
import { useResetUserPassword } from '@/hooks/data/useUsers';

import type { UserPayload } from '@shared/types';

const schema = z.object({
  password: z.string().min(8, 'At least 8 characters').max(128),
});

type FormValues = z.infer<typeof schema>;

/**
 * An administrator resetting somebody else's password.
 *
 * No current password: the administrator does not know it, and requiring one would make the
 * "I am locked out" case unresolvable — which is the only case this dialog exists for.
 *
 * `mustChangePassword` defaults to on, and saying so on screen matters: whatever is typed here
 * is now known to two people, and the reset is only finished when the owner of the account has
 * replaced it.
 *
 * Given a fresh `key` per open by `UsersList`, so the typed password never survives a close —
 * see the note on `editorSession` there.
 */
export function ResetPasswordDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: UserPayload | null;
}) {
  const resetPassword = useResetUserPassword();

  // Not a form field: `Switch` is a button, not an input, so react-hook-form has nothing to
  // register. Plain state is the honest model — and it keeps `form.watch` out of the component.
  const [mustChangePassword, setMustChangePassword] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
    mode: 'onTouched',
  });

  const onSubmit = form.handleSubmit((values) => {
    if (!user) return;

    resetPassword.mutate(
      { id: user.id, body: { ...values, mustChangePassword } },
      {
        onSuccess: onClose,
        onError: (error) => {
          const fields = fieldErrors(error);
          const passwordError = fields.find((f) => f.path === 'password');
          if (passwordError) form.setError('password', { message: passwordError.message });
          else toast.error(errorMessage(error));
        },
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={resetPassword.isPending ? () => undefined : onClose}
      title="Reset password"
      description={user ? `${user.name} will be signed out of every device.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={resetPassword.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={resetPassword.isPending}>
            {resetPassword.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Reset password
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="New password"
          required
          hint="At least 8 characters. Give it to them directly, never by message."
          error={form.formState.errors.password?.message}
        >
          {(props) => (
            <Input
              {...props}
              {...form.register('password')}
              type="text"
              // Visible on purpose: the administrator has to read it out. A masked field here
              // gets typed into a text editor first, which is worse.
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          )}
        </Field>

        <label className="flex items-start gap-2 text-sm">
          <Switch checked={mustChangePassword} onCheckedChange={setMustChangePassword} />
          <span>
            Require a change at next sign-in
            <span className="block text-xs text-muted-foreground">
              Leave on unless you have a reason. A password two people know is not theirs yet.
            </span>
          </span>
        </label>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

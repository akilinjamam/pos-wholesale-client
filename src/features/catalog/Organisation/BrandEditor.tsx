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
import { useCreateBrand, useUpdateBrand } from '@/hooks/data/useBrands';

import type { BrandPayload } from '@shared/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  logoUrl: z.string().trim().url('Must be a URL').or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export function BrandEditor({
  open,
  onClose,
  brand,
}: {
  open: boolean;
  onClose: () => void;
  brand: BrandPayload | null;
}) {
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const pending = createBrand.isPending || updateBrand.isPending;

  const [isActive, setIsActive] = useState(brand?.isActive ?? true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: brand?.name ?? '', logoUrl: brand?.logoUrl ?? '' },
    mode: 'onTouched',
  });

  const onError = (error: unknown) => {
    const fields = fieldErrors(error);
    let handled = false;
    for (const f of fields) {
      if (f.path === 'name' || f.path === 'logoUrl') {
        form.setError(f.path, { message: f.message });
        handled = true;
      }
    }
    if (!handled) toast.error(errorMessage(error));
  };

  const onSubmit = form.handleSubmit((values) => {
    const body = { name: values.name, logoUrl: values.logoUrl || null, isActive };

    if (brand) updateBrand.mutate({ id: brand.id, body }, { onSuccess: onClose, onError });
    // `slug` is left to the server, which derives it from the name — so "Ray Ban" and
    // "Ray-Ban" collide as one brand instead of splitting every report between them.
    else createBrand.mutate(body, { onSuccess: onClose, onError });
  });

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={brand ? `Edit ${brand.name}` : 'New brand'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {brand ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Name" required error={form.formState.errors.name?.message}>
          {(props) => <Input {...props} {...form.register('name')} placeholder="Ray-Ban" />}
        </Field>

        <Field label="Logo URL" error={form.formState.errors.logoUrl?.message}>
          {(props) => (
            <Input {...props} {...form.register('logoUrl')} placeholder="https://…" />
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          Active
        </label>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

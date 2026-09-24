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
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
} from '@/hooks/data/useCategories';
import { humanise } from '@/lib/utils';

import { PRODUCT_TYPES } from '@shared/enums';

import type { CategoryPayload } from '@shared/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  parentId: z.string(),
  productType: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function CategoryEditor({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  category: CategoryPayload | null;
}) {
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const pending = createCategory.isPending || updateCategory.isPending;

  const { data: categories } = useCategories({ limit: 200 });
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? '',
      parentId: category?.parentId ?? '',
      productType: category?.productType ?? '',
    },
    mode: 'onTouched',
  });

  const onError = (error: unknown) => {
    const fields = fieldErrors(error);
    let handled = false;
    for (const f of fields) {
      if (f.path === 'name' || f.path === 'parentId' || f.path === 'productType') {
        form.setError(f.path as keyof FormValues, { message: f.message });
        handled = true;
      }
    }
    if (!handled) toast.error(errorMessage(error));
  };

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      name: values.name,
      parentId: values.parentId || null,
      productType: (values.productType || null) as never,
      isActive,
    };

    if (category) {
      updateCategory.mutate({ id: category.id, body }, { onSuccess: onClose, onError });
    } else {
      createCategory.mutate(body, { onSuccess: onClose, onError });
    }
  });

  /**
   * A node cannot be parented into itself or its own subtree — the server refuses it, and
   * offering the option would only produce an error the user could have been spared.
   */
  const parentOptions = (categories?.items ?? []).filter(
    (c) => !category || (c.id !== category.id && !c.path.includes(category.id)),
  );

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={category ? `Edit ${category.name}` : 'New category'}
      description={
        category
          ? 'Moving this category moves everything beneath it.'
          : 'Categories nest as deep as you like.'
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {category ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Name" required error={form.formState.errors.name?.message}>
          {(props) => <Input {...props} {...form.register('name')} placeholder="Frames" />}
        </Field>

        <Field label="Parent" error={form.formState.errors.parentId?.message}>
          {(props) => (
            <Select {...props} {...form.register('parentId')}>
              <option value="">Top level</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.breadcrumb.join(' › ')}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Restrict to type"
          hint="Only products of this type may be filed here."
          error={form.formState.errors.productType?.message}
        >
          {(props) => (
            <Select {...props} {...form.register('productType')}>
              <option value="">Any type</option>
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanise(t)}
                </option>
              ))}
            </Select>
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

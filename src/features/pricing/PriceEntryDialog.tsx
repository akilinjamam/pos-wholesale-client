import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { errorCode, errorMessage, fieldErrors } from '@/api/client';
import { ProductPicker } from '@/components/common/ProductPicker';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { env } from '@/config/env';
import { useCreatePriceEntry, useUpdatePriceEntry } from '@/hooks/data/usePricing';
import { useVariants } from '@/hooks/data/useVariants';

import { fromMinor, toMinor } from '@shared/money';
import { uomOptions } from '@shared/uom';

import type { PriceScope } from './scope';
import type { PriceEntryPayload, ProductPayload } from '@shared/types';
import type { FieldPath } from 'react-hook-form';

/**
 * Add one price, or edit an existing one.
 *
 * On edit the **identity** — product, variant, unit — is fixed: changing any of them is a
 * different price, so the server refuses it and the form does not offer it. What can change is
 * the number, the qty break, the window and the note.
 *
 * The API's own rules (exactly one scope, a unit the product declares, no overlapping window)
 * are enforced server-side; this form's schema only covers what the inputs themselves produce,
 * and a 422 or 409 lands back on the field it is about.
 */

const formSchema = z
  .object({
    variantId: z.string(),
    uomCode: z.string().min(1, 'Choose a unit'),
    /** Major units. */
    price: z
      .number({ invalid_type_error: 'Enter a price' })
      .min(0, 'Cannot be negative')
      .max(999_999_999),
    minQty: z
      .number({ invalid_type_error: 'Enter a quantity' })
      .int('Whole units only')
      .min(1, 'At least 1'),
    validFrom: z.string(),
    validTo: z.string(),
    note: z.string().max(200),
    isActive: z.boolean(),
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, {
    path: ['validTo'],
    message: 'Ends before it starts',
  });

type FormValues = z.infer<typeof formSchema>;

/** Server path → form path, where they differ. */
const SERVER_TO_FORM: Record<string, string> = { priceMinor: 'price' };

export interface PriceEntryDialogProps {
  open: boolean;
  onClose: () => void;
  scope: PriceScope;
  /** Null adds. */
  entry: PriceEntryPayload | null;
}

export function PriceEntryDialog({ open, onClose, scope, entry }: PriceEntryDialogProps) {
  const createEntry = useCreatePriceEntry();
  const updateEntry = useUpdatePriceEntry();
  const pending = createEntry.isPending || updateEntry.isPending;

  const [product, setProduct] = useState<ProductPayload | null>(null);
  const [productError, setProductError] = useState<string | undefined>();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variantId: entry?.variantId ?? '',
      uomCode: entry?.uomCode ?? '',
      price: entry ? fromMinor(entry.priceMinor) : Number.NaN,
      minQty: entry?.minQty ?? 1,
      validFrom: entry?.validFrom ?? '',
      validTo: entry?.validTo ?? '',
      note: entry?.note ?? '',
      isActive: entry?.isActive ?? true,
    },
    mode: 'onTouched',
  });
  const errors = form.formState.errors;
  const isActive = useWatch({ control: form.control, name: 'isActive' });

  const { data: variants } = useVariants(
    { productId: product?.id ?? '', limit: 200 },
    Boolean(product?.hasVariants),
  );

  const units = entry ? (entry.uomOptions ?? []) : product ? uomOptions(product) : [];

  const onProduct = (next: ProductPayload | null) => {
    setProduct(next);
    setProductError(undefined);
    form.setValue('variantId', '');
    // Default to the largest pack — wholesale prices are quoted per dozen or per carton far more
    // often than per piece, so this saves a click on nearly every row.
    const packs = next ? uomOptions(next) : [];
    form.setValue('uomCode', packs[packs.length - 1]?.code ?? '', {
      shouldValidate: Boolean(next),
    });
  };

  const applyServerErrors = (error: unknown) => {
    const fields = fieldErrors(error);
    for (const f of fields) {
      if (f.path === 'productId') setProductError(f.message);
      else
        form.setError((SERVER_TO_FORM[f.path] ?? f.path) as FieldPath<FormValues>, {
          message: f.message,
        });
    }
    if (fields.length > 0) return;

    // An overlapping window is a 409, already toasted by the interceptor; pin it to the dates
    // too, since changing them is the usual fix.
    if (errorCode(error) === 'DUPLICATE_DOCUMENT') {
      form.setError('validFrom', { message: 'Overlaps an existing price for this rule' });
      return;
    }
    toast.error(errorMessage(error));
  };

  const onSubmit = form.handleSubmit((v) => {
    const common = {
      priceMinor: toMinor(v.price),
      minQty: v.minQty,
      validFrom: v.validFrom || null,
      validTo: v.validTo || null,
      note: v.note.trim() || null,
      isActive: v.isActive,
    };

    if (entry) {
      updateEntry.mutate(
        { id: entry.id, body: common },
        {
          onSuccess: () => {
            toast.success('Price updated');
            onClose();
          },
          onError: applyServerErrors,
        },
      );
      return;
    }

    if (!product) {
      setProductError('Choose a product');
      return;
    }
    createEntry.mutate(
      {
        ...scope,
        productId: product.id,
        variantId: v.variantId || null,
        uomCode: v.uomCode,
        ...common,
      },
      { onSuccess: onClose, onError: applyServerErrors },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={entry ? `Edit price — ${entry.sku}` : 'Add a price'}
      description={
        entry
          ? 'Product, variant and unit are fixed. To price a different one, add a new entry.'
          : 'For a qty break, add one entry per minimum quantity.'
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {entry ? 'Save' : 'Add price'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" required error={productError} className="sm:col-span-2">
          {(props) =>
            entry ? (
              <Input
                {...props}
                value={`${entry.productName ?? ''} · ${entry.sku ?? ''}`}
                disabled
                readOnly
              />
            ) : (
              <ProductPicker
                id={props.id}
                aria-describedby={props['aria-describedby']}
                invalid={props['aria-invalid']}
                value={product}
                onChange={onProduct}
              />
            )
          }
        </Field>

        {(entry?.variantId || product?.hasVariants) && (
          <Field
            label="Variant"
            error={errors.variantId?.message}
            hint={
              entry ? undefined : 'Leave on "All variants" to price the product as a whole.'
            }
          >
            {(props) =>
              entry ? (
                <Input
                  {...props}
                  value={entry.variantLabel ?? 'All variants'}
                  disabled
                  readOnly
                />
              ) : (
                <Select {...props} {...form.register('variantId')}>
                  <option value="">All variants</option>
                  {(variants?.items ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              )
            }
          </Field>
        )}

        <Field label="Unit" required error={errors.uomCode?.message}>
          {(props) => (
            <Select
              {...props}
              {...form.register('uomCode')}
              disabled={Boolean(entry) || units.length === 0}
            >
              {units.length === 0 && <option value="">Choose a product first</option>}
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code}
                  {u.factor > 1 ? ` (×${u.factor})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label={`Price per unit (${env.currency})`}
          required
          error={errors.price?.message}
        >
          {(props) => (
            <Input
              {...props}
              {...form.register('price', { valueAsNumber: true })}
              type="number"
              step="0.01"
              min={0}
              autoFocus={Boolean(entry)}
            />
          )}
        </Field>

        <Field
          label="From quantity"
          required
          error={errors.minQty?.message}
          hint="In the chosen unit. 3 on a DOZ price means from 3 dozen."
        >
          {(props) => (
            <Input
              {...props}
              {...form.register('minQty', { valueAsNumber: true })}
              type="number"
              min={1}
              step={1}
            />
          )}
        </Field>

        <Field
          label="Valid from"
          error={errors.validFrom?.message}
          hint="Blank: already in force."
        >
          {(props) => <Input {...props} {...form.register('validFrom')} type="date" />}
        </Field>

        <Field
          label="Valid to"
          error={errors.validTo?.message}
          hint="Blank: until further notice."
        >
          {(props) => <Input {...props} {...form.register('validTo')} type="date" />}
        </Field>

        <Field label="Note" error={errors.note?.message} className="sm:col-span-2">
          {(props) => (
            <Input {...props} {...form.register('note')} placeholder="Eid promotion" />
          )}
        </Field>

        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <Switch
            checked={isActive}
            onCheckedChange={(next) => form.setValue('isActive', next, { shouldDirty: true })}
          />
          Active — an inactive price is kept on file but never quoted.
        </label>
      </form>
    </Dialog>
  );
}

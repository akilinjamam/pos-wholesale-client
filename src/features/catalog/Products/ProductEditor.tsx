import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { errorMessage, fieldErrors } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/data/useAuth';
import { useBrands } from '@/hooks/data/useBrands';
import { useCategories } from '@/hooks/data/useCategories';
import { useCreateProduct, useUpdateProduct } from '@/hooks/data/useProducts';
import { env } from '@/config/env';
import { humanise } from '@/lib/utils';

import { AttributeFields } from './attrs/AttributeFields';
import {
  emptyAttrsFor,
  productFormSchema,
  toFormValues,
  toRequestBody,
  type ProductFormValues,
} from './productSchema';

import { AXES_BY_TYPE } from '@shared/catalog';
import { BASE_UOMS, PRODUCT_TYPES, TRACKING_MODES } from '@shared/enums';

import type { ProductType, TrackingMode } from '@shared/enums';
import type { ProductPayload } from '@shared/types';
import type { FieldPath } from 'react-hook-form';

/**
 * Create or edit a product.
 *
 * The form is one schema — `productFormSchema` — whose attribute half *is* the server's union.
 * Switching `type` swaps the attribute section and **replaces** `attrs` wholesale, because the
 * union is strict: a leftover `refractiveIndex` from a lens would make the frame it became
 * permanently invalid, with the error on a field no longer on screen.
 *
 * Given a fresh `key` per open by `ProductsList`, so a mount is an open — see the note there.
 */

/**
 * Server field paths that differ from the form's.
 *
 * Money is edited in major units, so the API's `*Minor` names have no input to land on. Without
 * this map a 422 on `mrpMinor` would be dropped and the user would see a save that silently
 * did nothing.
 */
const SERVER_TO_FORM: Record<string, string> = {
  mrpMinor: 'mrp',
  defaultSellPriceMinor: 'sellPrice',
  standardCostMinor: 'standardCost',
};

/**
 * The tracking mode the API would choose for a type when none is given.
 *
 * Mirrors `resolveTrackingMode` on the server. Serial numbers are how a machine's warranty is
 * honoured and how a specific unit is traced back to the dealer it went to; a machine without
 * them is a gap nobody notices until a claim.
 */
function defaultTrackingFor(type: ProductType): TrackingMode {
  return type === 'MACHINE' ? 'SERIAL' : 'NONE';
}

export interface ProductEditorProps {
  open: boolean;
  onClose: () => void;
  /** Null creates. */
  product: ProductPayload | null;
}

export function ProductEditor({ open, onClose, product }: ProductEditorProps) {
  const canViewCost = usePermission('stock:viewCost');
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const pending = createProduct.isPending || updateProduct.isPending;

  // 200 is `paginate`'s cap, and comfortably more brands or categories than an optical
  // wholesaler carries. A searchable picker arrives with the order builder on Day 23.
  const { data: brands } = useBrands({ limit: 200, isActive: true });
  const { data: categories } = useCategories({ limit: 200, isActive: true });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: toFormValues(product),
    mode: 'onTouched',
  });

  const type = useWatch({ control: form.control, name: 'type' });
  const hasVariants = useWatch({ control: form.control, name: 'hasVariants' });
  const variantAxes = useWatch({ control: form.control, name: 'variantAxes' });
  const isActive = useWatch({ control: form.control, name: 'isActive' });
  const atCounter = useWatch({ control: form.control, name: 'isSellableAtCounter' });
  const wholesale = useWatch({ control: form.control, name: 'isSellableWholesale' });

  const allowedAxes: readonly string[] = AXES_BY_TYPE[type] ?? [];

  /** Swapping type replaces the attribute set and the axes — see the note above. */
  const onTypeChange = (next: ProductType) => {
    form.setValue('attrs', emptyAttrsFor(next), { shouldValidate: false });
    form.setValue('variantAxes', [], { shouldValidate: false });
    form.clearErrors('attrs');
    form.clearErrors('variantAxes');

    // A machine cannot have variants at all, so the toggle would be a trap.
    if ((AXES_BY_TYPE[next] ?? []).length === 0) {
      form.setValue('hasVariants', false, { shouldValidate: false });
    }

    // Match the server's default for the type. The API defaults a machine to SERIAL when no
    // mode is given, but a form always sends one — so without this, creating a machine here
    // would silently produce an untracked machine, and the warranty register (Day 15) would
    // have nothing to follow.
    form.setValue('trackingMode', defaultTrackingFor(next), { shouldValidate: false });
  };

  const toggleAxis = (axis: string) => {
    const current = variantAxes ?? [];
    form.setValue(
      'variantAxes',
      current.includes(axis) ? current.filter((a) => a !== axis) : [...current, axis],
      { shouldValidate: true },
    );
  };

  const applyServerErrors = (error: unknown) => {
    const fields = fieldErrors(error);
    let handled = false;

    for (const field of fields) {
      const path = SERVER_TO_FORM[field.path] ?? field.path;
      form.setError(path as FieldPath<ProductFormValues>, { message: field.message });
      handled = true;
    }
    if (!handled) toast.error(errorMessage(error));
  };

  const onSubmit = form.handleSubmit((values) => {
    const body = toRequestBody(values, { includeCost: canViewCost });

    if (product) {
      updateProduct.mutate(
        { id: product.id, body },
        { onSuccess: onClose, onError: applyServerErrors },
      );
    } else {
      createProduct.mutate(body, { onSuccess: onClose, onError: applyServerErrors });
    }
  });

  const errors = form.formState.errors;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={product ? `Edit ${product.name}` : 'New product'}
      description={
        product
          ? 'The product type cannot be changed — it decides the attributes, the variant axes and the tracking mode.'
          : 'Choose the type first: it decides which attributes apply.'
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {product ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {/* ── Identity ── */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" required error={errors.type?.message}>
            {(props) => (
              <Select
                {...props}
                {...form.register('type', {
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                    onTypeChange(e.target.value as ProductType),
                })}
                // Immutable once created: changing it would invalidate the attributes, the
                // variant axes, and the tracking mode its ledger rows were written under.
                disabled={Boolean(product)}
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanise(t)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="SKU"
            required
            error={errors.sku?.message}
            hint="Unique across the catalogue."
          >
            {(props) => (
              <Input
                {...props}
                {...form.register('sku')}
                className="font-mono uppercase"
                placeholder="FRM-0001"
                autoComplete="off"
              />
            )}
          </Field>

          <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
            {(props) => (
              <Input {...props} {...form.register('name')} placeholder="Aviator Classic" />
            )}
          </Field>

          <Field label="Brand" error={errors.brandId?.message}>
            {(props) => (
              <Select {...props} {...form.register('brandId')}>
                <option value="">No brand</option>
                {(brands?.items ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Category" error={errors.categoryId?.message}>
            {(props) => (
              <Select {...props} {...form.register('categoryId')}>
                <option value="">No category</option>
                {(categories?.items ?? [])
                  // A category pinned to another type would be refused on save, so it is not
                  // offered in the first place.
                  .filter((c) => !c.productType || c.productType === type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.breadcrumb.join(' › ')}
                    </option>
                  ))}
              </Select>
            )}
          </Field>

          <Field label="Barcode" error={errors.barcode?.message} hint="Unique where given.">
            {(props) => (
              <Input
                {...props}
                {...form.register('barcode')}
                className="font-mono"
                autoComplete="off"
              />
            )}
          </Field>

          <Field label="HS code" error={errors.hsCode?.message}>
            {(props) => <Input {...props} {...form.register('hsCode')} autoComplete="off" />}
          </Field>

          <Field
            label="Description"
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            {(props) => <Textarea {...props} {...form.register('description')} rows={2} />}
          </Field>
        </section>

        {/* ── Attributes: the type-aware half ── */}
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{humanise(type)} attributes</p>
            <p className="text-xs text-muted-foreground">
              These fields change with the product type.
            </p>
          </div>
          <AttributeFields form={form} type={type} />
        </section>

        {/* ── Units and tracking ── */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Base unit"
            required
            error={errors.baseUom?.message}
            hint="Every stock figure and ledger row is in this unit."
          >
            {(props) => (
              <Select {...props} {...form.register('baseUom')} disabled={Boolean(product)}>
                {BASE_UOMS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Tracking"
            error={errors.trackingMode?.message}
            hint="Lots carry expiry dates; serials follow individual units."
          >
            {(props) => (
              <Select {...props} {...form.register('trackingMode')}>
                {TRACKING_MODES.map((m) => (
                  <option key={m} value={m}>
                    {humanise(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </section>

        {/* ── Variants ── */}
        {allowedAxes.length > 0 && (
          <section className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <Switch
                checked={Boolean(hasVariants)}
                onCheckedChange={(next) =>
                  form.setValue('hasVariants', next, { shouldValidate: true })
                }
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Has variants</span>
                <span className="block text-xs text-muted-foreground">
                  Individual variants are created on first receipt, not up front.
                </span>
              </span>
            </label>

            {hasVariants && (
              <div className="space-y-1 pl-11">
                <div className="flex flex-wrap gap-3">
                  {allowedAxes.map((axis) => (
                    <label key={axis} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(variantAxes ?? []).includes(axis)}
                        onChange={() => toggleAxis(axis)}
                      />
                      {humanise(axis)}
                    </label>
                  ))}
                </div>
                {errors.variantAxes?.message && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {errors.variantAxes.message}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Pricing ── */}
        <section className="space-y-3">
          <p className="text-sm font-medium">Pricing ({env.currency})</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="MRP" error={errors.mrp?.message}>
              {(props) => (
                <Input
                  {...props}
                  {...form.register('mrp', { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                />
              )}
            </Field>

            <Field
              label="Default sell price"
              error={errors.sellPrice?.message}
              hint="The fallback when no tier applies."
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('sellPrice', { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                />
              )}
            </Field>

            {/* Only for `stock:viewCost`. The field is absent from the payload without it, so
                rendering the input would submit 0 and silently wipe the real figure. */}
            {canViewCost && (
              <Field label="Standard cost" error={errors.standardCost?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register('standardCost', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                  />
                )}
              </Field>
            )}

            <Field label="Tax rate %" error={errors.taxRatePct?.message}>
              {(props) => (
                <Input
                  {...props}
                  {...form.register('taxRatePct', { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                />
              )}
            </Field>
          </div>
        </section>

        {/* ── Replenishment ── */}
        <section className="space-y-3">
          <p className="text-sm font-medium">Replenishment</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Reorder point"
              error={errors.reorderPoint?.message}
              hint="Below this, it appears in reorder suggestions."
            >
              {(props) => (
                <Input
                  {...props}
                  {...form.register('reorderPoint', { valueAsNumber: true })}
                  type="number"
                />
              )}
            </Field>
            <Field label="Reorder quantity" error={errors.reorderQty?.message}>
              {(props) => (
                <Input
                  {...props}
                  {...form.register('reorderQty', { valueAsNumber: true })}
                  type="number"
                />
              )}
            </Field>
            <Field label="Lead time (days)" error={errors.leadTimeDays?.message}>
              {(props) => (
                <Input
                  {...props}
                  {...form.register('leadTimeDays', { valueAsNumber: true })}
                  type="number"
                />
              )}
            </Field>
          </div>
        </section>

        {/* ── Availability ── */}
        <section className="flex flex-wrap gap-6 border-t pt-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={Boolean(isActive)}
              onCheckedChange={(v) => form.setValue('isActive', v, { shouldDirty: true })}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={Boolean(atCounter)}
              onCheckedChange={(v) =>
                form.setValue('isSellableAtCounter', v, { shouldDirty: true })
              }
            />
            Sell at the counter
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={Boolean(wholesale)}
              onCheckedChange={(v) =>
                form.setValue('isSellableWholesale', v, { shouldDirty: true })
              }
            />
            Sell wholesale
          </label>
        </section>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

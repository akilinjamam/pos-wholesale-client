import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { emptyAddress } from './partyForm';

import type { PartyFormValues } from './partyForm';
import type { UseFormReturn } from 'react-hook-form';

/**
 * A party's addresses — a shop, a godown, a branch in another district.
 *
 * At most one default billing and one default shipping address; the order builder (Day 23)
 * preselects them. Ticking "default" on one row **unticks it on the others** rather than
 * letting the user produce two and then showing an error about it — the shared schema would
 * refuse two, and the only sensible reading of the click is "this one instead".
 */
export function AddressFields({
  form,
  disabled,
}: {
  form: UseFormReturn<PartyFormValues>;
  disabled?: boolean;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'addresses',
  });
  const addresses = useWatch({ control: form.control, name: 'addresses' }) ?? [];
  const errors = form.formState.errors.addresses;

  const setDefault = (index: number, flag: 'isDefaultBilling' | 'isDefaultShipping') => {
    const turningOn = !addresses[index]?.[flag];
    addresses.forEach((_, i) => {
      form.setValue(`addresses.${i}.${flag}`, turningOn && i === index, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
  };

  const add = () =>
    append({
      ...emptyAddress,
      // The first address is the default for both, which is right for the one-shop dealer
      // that most of them are.
      label: fields.length === 0 ? 'Shop' : '',
      isDefaultBilling: fields.length === 0,
      isDefaultShipping: fields.length === 0,
    });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Addresses</p>
          <p className="text-xs text-muted-foreground">
            Up to ten. The defaults are preselected on orders and invoices.
          </p>
        </div>
        {!disabled && fields.length < 10 && (
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus aria-hidden="true" />
            Add address
          </Button>
        )}
      </div>

      {fields.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          No address yet. A delivery challan needs one, but it can be added later.
        </p>
      )}

      {fields.map((field, index) => {
        const rowErrors = errors?.[index];
        return (
          <div key={field.id} className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Label" required error={rowErrors?.label?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register(`addresses.${index}.label`)}
                    placeholder="Shop, Godown…"
                    disabled={disabled}
                  />
                )}
              </Field>
              <Field
                label="Address line 1"
                required
                error={rowErrors?.line1?.message}
                className="sm:col-span-2"
              >
                {(props) => (
                  <Input
                    {...props}
                    {...form.register(`addresses.${index}.line1`)}
                    placeholder="House, road, market"
                    disabled={disabled}
                  />
                )}
              </Field>
              <Field label="Line 2" error={rowErrors?.line2?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register(`addresses.${index}.line2`)}
                    disabled={disabled}
                  />
                )}
              </Field>
              <Field label="City / thana" error={rowErrors?.city?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register(`addresses.${index}.city`)}
                    disabled={disabled}
                  />
                )}
              </Field>
              <Field label="District" error={rowErrors?.district?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register(`addresses.${index}.district`)}
                    disabled={disabled}
                  />
                )}
              </Field>
              <Field label="Contact person" error={rowErrors?.contactName?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register(`addresses.${index}.contactName`)}
                    disabled={disabled}
                  />
                )}
              </Field>
              <Field label="Contact phone" error={rowErrors?.phone?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register(`addresses.${index}.phone`)}
                    inputMode="tel"
                    disabled={disabled}
                  />
                )}
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={Boolean(addresses[index]?.isDefaultBilling)}
                    onChange={() => setDefault(index, 'isDefaultBilling')}
                    disabled={disabled}
                  />
                  Default billing
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={Boolean(addresses[index]?.isDefaultShipping)}
                    onChange={() => setDefault(index, 'isDefaultShipping')}
                    disabled={disabled}
                  />
                  Default shipping
                </label>
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => remove(index)}
                >
                  <Trash2 aria-hidden="true" />
                  Remove
                </Button>
              )}
            </div>
            {(rowErrors?.isDefaultBilling?.message ||
              rowErrors?.isDefaultShipping?.message) && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {rowErrors?.isDefaultBilling?.message ?? rowErrors?.isDefaultShipping?.message}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

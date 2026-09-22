import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { errorMessage, fieldErrors } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCreateLocation, useUpdateLocation } from '@/hooks/data/useLocations';

import { LOCATION_TYPES } from '@shared/enums';

import type { LocationType } from '@shared/enums';
import type { LocationPayload } from '@shared/types';

/** What each type is for — shown under the selector, because the choice is permanent in effect. */
const TYPE_HELP: Record<LocationType, string> = {
  WAREHOUSE: 'Stock that can be sold or dispatched from.',
  COUNTER: 'A POS till. A shift opens against one of these.',
  TRANSIT: 'The holding leg of a two-step transfer — in-flight stock sits here.',
  DAMAGE: 'Written-off goods: on the books, out of available stock.',
};

const schema = z.object({
  code: z.string().trim().min(1, 'Required').max(20),
  name: z.string().trim().min(1, 'Required').max(120),
  type: z.enum(LOCATION_TYPES),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

type FormValues = z.infer<typeof schema>;

export function LocationEditor({
  open,
  onClose,
  location,
}: {
  open: boolean;
  onClose: () => void;
  location: LocationPayload | null;
}) {
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const pending = createLocation.isPending || updateLocation.isPending;

  // Initialised at mount; `LocationsList` gives this a fresh `key` per open, so a mount is an
  // open. See the note on `editorSession` there.
  const [allowsSales, setAllowsSales] = useState(location?.allowsSales ?? true);
  const [allowsPurchase, setAllowsPurchase] = useState(location?.allowsPurchase ?? true);
  const [isActive, setIsActive] = useState(location?.isActive ?? true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: location?.code ?? '',
      name: location?.name ?? '',
      type: location?.type ?? 'WAREHOUSE',
      address: location?.address ?? '',
      phone: location?.phone ?? '',
      sortOrder: location?.sortOrder ?? 0,
    },
    mode: 'onTouched',
  });

  const applyFieldErrors = (error: unknown) => {
    const fields = fieldErrors(error);
    const known = new Set(['code', 'name', 'type', 'address', 'phone', 'sortOrder']);
    let handled = false;
    for (const field of fields) {
      if (known.has(field.path)) {
        form.setError(field.path as keyof FormValues, { message: field.message });
        handled = true;
      }
    }
    if (!handled) toast.error(errorMessage(error));
  };

  const onSubmit = form.handleSubmit((values) => {
    const common = {
      name: values.name,
      type: values.type,
      address: values.address?.length ? values.address : null,
      phone: values.phone?.length ? values.phone : null,
      allowsSales,
      allowsPurchase,
      isActive,
      sortOrder: values.sortOrder,
    };

    if (location) {
      updateLocation.mutate(
        { id: location.id, body: common },
        { onSuccess: onClose, onError: applyFieldErrors },
      );
    } else {
      createLocation.mutate(
        { ...common, code: values.code.toUpperCase() },
        { onSuccess: onClose, onError: applyFieldErrors },
      );
    }
  });

  // `useWatch` rather than `form.watch`, which the React Compiler cannot analyse and bails out
  // on — taking the whole component's memoisation with it.
  const type = useWatch({ control: form.control, name: 'type' });

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={location ? `Edit ${location.name}` : 'New location'}
      description="A location is where stock physically sits. Every balance and every ledger row is scoped to one."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {location ? 'Save changes' : 'Create location'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code"
            required
            error={form.formState.errors.code?.message}
            hint={
              location
                ? 'Fixed — stock rows were written against it.'
                : 'Short and permanent, e.g. MAIN.'
            }
          >
            {(props) => (
              <Input
                {...props}
                {...form.register('code')}
                // Immutable: it is the natural key that balances and ledger rows carry. A
                // mistyped code is fixed by deactivating this one and creating another.
                disabled={Boolean(location)}
                className="font-mono uppercase"
                placeholder="MAIN"
              />
            )}
          </Field>

          <Field label="Name" required error={form.formState.errors.name?.message}>
            {(props) => (
              <Input {...props} {...form.register('name')} placeholder="Main Warehouse" />
            )}
          </Field>
        </div>

        <Field
          label="Type"
          required
          hint={TYPE_HELP[type]}
          error={form.formState.errors.type?.message}
        >
          {(props) => (
            <Select {...props} {...form.register('type')} className="max-w-xs">
              {LOCATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={form.formState.errors.phone?.message}>
            {(props) => <Input {...props} {...form.register('phone')} />}
          </Field>

          <Field
            label="Sort order"
            hint="Lower comes first in pickers."
            error={form.formState.errors.sortOrder?.message}
          >
            {(props) => (
              <Input {...props} {...form.register('sortOrder')} type="number" min={0} />
            )}
          </Field>
        </div>

        <Field label="Address" error={form.formState.errors.address?.message}>
          {(props) => <Textarea {...props} {...form.register('address')} rows={2} />}
        </Field>

        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={allowsSales} onCheckedChange={setAllowsSales} />
            Can sell and dispatch from here
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={allowsPurchase} onCheckedChange={setAllowsPurchase} />
            Can receive purchases here
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            Active
          </label>
        </div>

        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { Loader2, Lock, UserCheck } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { errorMessage, fieldErrors } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { env } from '@/config/env';
import { humanise } from '@/lib/utils';
import { usePermission } from '@/hooks/data/useAuth';
import { useOrg } from '@/hooks/data/useOrg';
import {
  useCreateParty,
  useEnrolParty,
  usePartyCandidates,
  useUpdateParty,
} from '@/hooks/data/useParties';
import { useUsers } from '@/hooks/data/useUsers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { AddressFields } from './AddressFields';
import { partyFormSchema, serverPathToForm, toFormValues, toRequestBody } from './partyForm';

import { PARTY_ROLE_LABELS } from '@shared/party';

import type { EditableRole, PartyFormValues } from './partyForm';
import type { ApiFailure, PartyPayload } from '@shared/types';
import type { FieldPath } from 'react-hook-form';

/**
 * Create or edit a dealer or a customer — one form, because they are one entity.
 *
 * **The credit fields are gated beyond `dealer:update`.** Credit limit and payment terms need
 * `dealer:setCreditLimit`; the hold needs `dealer:creditHold`. The inputs are disabled for a
 * user without the grant, but that is courtesy, not control: the server compares the submitted
 * values with the stored ones and answers **403 naming the fields** if a gated one changed.
 * Because only a *change* is refused, a sales rep can save a dealer's phone number even though
 * the unchanged credit limit travels in the same PATCH.
 *
 * On create it also checks for the party already being on file under another role — a supplier
 * who has started buying from us — and offers to add the role to that record instead of making
 * a duplicate with a second ledger.
 */
export interface PartyEditorProps {
  role: EditableRole;
  open: boolean;
  onClose: () => void;
  /** Null creates. */
  party: PartyPayload | null;
  /** Called with the saved record — e.g. to open the new dealer's profile. */
  onSaved?: (party: PartyPayload) => void;
}

/** A 403 from the credit gate carries the refused paths in `details.fields`. */
function forbiddenFields(error: unknown): string[] {
  if (!(error instanceof AxiosError) || error.response?.status !== 403) return [];
  const details = (error.response.data as ApiFailure | undefined)?.error?.details;
  if (!details || Array.isArray(details)) return [];
  const fields = (details as { fields?: unknown }).fields;
  return Array.isArray(fields) ? fields.filter((f): f is string => typeof f === 'string') : [];
}

export function PartyEditor({ role, open, onClose, party, onSaved }: PartyEditorProps) {
  const isDealer = role === 'DEALER';
  const noun = PARTY_ROLE_LABELS[role].one;

  const canCreate = usePermission(isDealer ? 'dealer:create' : 'customer:create');
  const canUpdate = usePermission(isDealer ? 'dealer:update' : 'customer:update');
  const canSetCredit = usePermission('dealer:setCreditLimit');
  const canHold = usePermission('dealer:creditHold');
  const canReadUsers = usePermission('user:read');

  const readOnly = party ? !canUpdate : !canCreate;

  const createParty = useCreateParty(role);
  const updateParty = useUpdateParty(role);
  const enrolParty = useEnrolParty(role);
  const pending = createParty.isPending || updateParty.isPending || enrolParty.isPending;

  const { data: org } = useOrg();
  // The salesperson picker needs `user:read`, which a sales rep does not hold — they see the
  // current assignment as text instead of a list of every account in the company.
  const { data: users } = useUsers(
    canReadUsers && isDealer ? { limit: 200, isActive: true, sort: 'name' } : { limit: 1 },
  );

  const form = useForm<PartyFormValues>({
    resolver: zodResolver(partyFormSchema),
    defaultValues: toFormValues(role, party, {
      defaultTermsDays: org?.settings.defaultPaymentTermsDays ?? 30,
    }),
    mode: 'onTouched',
  });

  const errors = form.formState.errors;
  const creditHold = useWatch({ control: form.control, name: 'dealer.creditHold' });
  const isActive = useWatch({ control: form.control, name: 'isActive' });
  const name = useWatch({ control: form.control, name: 'name' });
  const phone = useWatch({ control: form.control, name: 'phone' });

  // Phone first: the same shop is spelt three ways, but its number is not.
  const lookup = useDebouncedValue(phone.replace(/\D/g, '').length >= 6 ? phone : name, 400);
  const { data: candidates } = usePartyCandidates(role, lookup, !party && canCreate);

  const applyServerErrors = (error: unknown) => {
    const refused = forbiddenFields(error);
    for (const path of refused) {
      form.setError(serverPathToForm(path) as FieldPath<PartyFormValues>, {
        message: 'You do not have permission to change this',
      });
    }
    // The interceptor has already toasted a 403, so only fall back to a toast when nothing
    // could be attached to a field *and* it was not a 403.
    if (refused.length > 0) return;

    const fields = fieldErrors(error);
    for (const field of fields) {
      form.setError(serverPathToForm(field.path) as FieldPath<PartyFormValues>, {
        message: field.message,
      });
    }
    if (
      fields.length === 0 &&
      !(error instanceof AxiosError && error.response?.status === 403)
    ) {
      toast.error(errorMessage(error));
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    const body = toRequestBody(values, { isEdit: Boolean(party) });

    // On create, leave out the gated fields this user cannot set, so the server applies its own
    // defaults. Sending the form's values instead would be refused whenever they differ from
    // those defaults — e.g. terms prefilled at 30 before the org's 45 had loaded. On edit they
    // round-trip unchanged, which the server accepts.
    if (!party && 'dealer' in body && body.dealer) {
      if (!canSetCredit) {
        delete body.dealer.creditLimitMinor;
        delete body.dealer.paymentTermsDays;
      }
      if (!canHold) {
        delete body.dealer.creditHold;
        delete body.dealer.creditHoldReason;
      }
    }

    const done = (saved: PartyPayload) => {
      onClose();
      onSaved?.(saved);
    };

    if (party) {
      updateParty.mutate(
        { id: party.id, body },
        { onSuccess: done, onError: applyServerErrors },
      );
    } else {
      createParty.mutate(body, { onSuccess: done, onError: applyServerErrors });
    }
  });

  const enrolExisting = (id: string) =>
    enrolParty.mutate(
      { id },
      {
        onSuccess: (saved) => {
          onClose();
          onSaved?.(saved);
        },
      },
    );

  const gatedHint = (permission: string) => `Needs the "${permission}" permission.`;
  const salespersonName = party?.dealer?.salespersonName;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={party ? `${readOnly ? '' : 'Edit '}${party.name}` : `New ${noun.toLowerCase()}`}
      description={
        party
          ? `Code ${party.code}. Codes are printed on every invoice and statement, so they never change.`
          : 'A code is generated when you save, unless you are carrying over an existing one.'
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button onClick={onSubmit} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {party ? 'Save changes' : `Create ${noun.toLowerCase()}`}
            </Button>
          )}
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {/* ── Already on file? ── */}
        {!party && candidates && candidates.length > 0 && (
          <section
            aria-live="polite"
            className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3"
          >
            <p className="text-sm font-medium">Already on file under another role?</p>
            <p className="text-xs text-muted-foreground">
              Adding the {noun.toLowerCase()} role to an existing record keeps one ledger and
              one balance. A second record would split them.
            </p>
            <ul className="divide-y">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">{c.code}</span>
                      {c.phone && <span>· {c.phone}</span>}
                      {c.roles.map((r) => (
                        <Badge key={r} variant="outline" className="py-0">
                          {humanise(r)}
                        </Badge>
                      ))}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => enrolExisting(c.id)}
                    disabled={pending}
                  >
                    <UserCheck aria-hidden="true" />
                    Make {noun.toLowerCase()}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Identity ── */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
            {(props) => (
              <Input
                {...props}
                {...form.register('name')}
                placeholder={isDealer ? 'Rahman Optics' : 'Customer name'}
                disabled={readOnly}
              />
            )}
          </Field>

          <Field
            label="Trading name"
            error={errors.displayName?.message}
            hint="Printed on documents, when it differs from the name."
          >
            {(props) => (
              <Input {...props} {...form.register('displayName')} disabled={readOnly} />
            )}
          </Field>

          <Field
            label="Code"
            error={errors.code?.message}
            hint={party ? undefined : 'Leave blank to generate P-00001, P-00002…'}
          >
            {(props) => (
              <Input
                {...props}
                {...form.register('code')}
                className="font-mono uppercase"
                placeholder="Automatic"
                autoComplete="off"
                disabled={Boolean(party) || readOnly}
              />
            )}
          </Field>

          <Field label="Phone" error={errors.phone?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('phone')}
                inputMode="tel"
                placeholder="01711-123456"
                disabled={readOnly}
              />
            )}
          </Field>

          <Field label="Email" error={errors.email?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('email')}
                type="email"
                autoComplete="off"
                disabled={readOnly}
              />
            )}
          </Field>

          <Field label="TIN" error={errors.tin?.message}>
            {(props) => <Input {...props} {...form.register('tin')} disabled={readOnly} />}
          </Field>

          <Field label="BIN" error={errors.bin?.message} hint="VAT registration number.">
            {(props) => <Input {...props} {...form.register('bin')} disabled={readOnly} />}
          </Field>

          <Field label="Trade licence no." error={errors.tradeLicenseNo?.message}>
            {(props) => (
              <Input {...props} {...form.register('tradeLicenseNo')} disabled={readOnly} />
            )}
          </Field>

          <Field
            label="Tags"
            error={errors.tagsText?.message}
            hint="Comma-separated, e.g. key-account, chattogram."
          >
            {(props) => <Input {...props} {...form.register('tagsText')} disabled={readOnly} />}
          </Field>
        </section>

        {/* ── Commercial terms (dealers only) ── */}
        {isDealer && (
          <section className="space-y-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Commercial terms</p>
              <p className="text-xs text-muted-foreground">
                What this dealer pays, how long they have to pay it, and how much they may owe.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label={`Credit limit (${env.currency})`}
                error={errors.dealer?.creditLimit?.message}
                hint={canSetCredit ? '0 means cash only.' : gatedHint('dealer:setCreditLimit')}
              >
                {(props) => (
                  <Input
                    {...props}
                    {...form.register('dealer.creditLimit', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={readOnly || !canSetCredit}
                  />
                )}
              </Field>

              <Field
                label="Payment terms (days)"
                error={errors.dealer?.paymentTermsDays?.message}
                hint={
                  canSetCredit
                    ? 'Due date = invoice date + terms.'
                    : gatedHint('dealer:setCreditLimit')
                }
              >
                {(props) => (
                  <Input
                    {...props}
                    {...form.register('dealer.paymentTermsDays', { valueAsNumber: true })}
                    type="number"
                    min={0}
                    max={365}
                    disabled={readOnly || !canSetCredit}
                  />
                )}
              </Field>

              <Field
                label="Price tier"
                error={errors.dealer?.priceTierId?.message}
                hint="Tiers arrive with price lists (Day 11)."
              >
                {(props) => (
                  <Select {...props} {...form.register('dealer.priceTierId')} disabled>
                    <option value="">Default (retail)</option>
                  </Select>
                )}
              </Field>

              <Field
                label="Trade discount (%)"
                error={errors.dealer?.discountPct?.message}
                hint="Applied after the tier price."
              >
                {(props) => (
                  <Input
                    {...props}
                    {...form.register('dealer.discountPct', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    disabled={readOnly}
                  />
                )}
              </Field>

              <Field label="Salesperson" error={errors.dealer?.salespersonUserId?.message}>
                {(props) =>
                  canReadUsers ? (
                    <Select
                      {...props}
                      {...form.register('dealer.salespersonUserId')}
                      disabled={readOnly}
                    >
                      <option value="">Unassigned</option>
                      {(users?.items ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      {...props}
                      value={salespersonName ?? 'Unassigned'}
                      disabled
                      readOnly
                    />
                  )
                }
              </Field>

              <Field label="Territory" error={errors.dealer?.territory?.message}>
                {(props) => (
                  <Input
                    {...props}
                    {...form.register('dealer.territory')}
                    placeholder="Dhaka North"
                    disabled={readOnly}
                  />
                )}
              </Field>

              <Field
                label="Trading since"
                error={errors.dealer?.since?.message}
                className="lg:col-start-1"
              >
                {(props) => (
                  <Input
                    {...props}
                    {...form.register('dealer.since')}
                    type="date"
                    disabled={readOnly}
                  />
                )}
              </Field>
            </div>

            <div className="space-y-3 border-t pt-4">
              <label className="flex items-start gap-3 text-sm">
                <Switch
                  checked={Boolean(creditHold)}
                  onCheckedChange={(next) =>
                    form.setValue('dealer.creditHold', next, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={readOnly || !canHold}
                  className="mt-0.5"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    Credit hold
                    {!canHold && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {canHold
                      ? 'Blocks new credit orders until lifted. Cash sales are unaffected.'
                      : gatedHint('dealer:creditHold')}
                  </span>
                </span>
              </label>

              {creditHold && (
                <Field
                  label="Reason for the hold"
                  required
                  error={errors.dealer?.creditHoldReason?.message}
                  className="sm:pl-12"
                >
                  {(props) => (
                    <Input
                      {...props}
                      {...form.register('dealer.creditHoldReason')}
                      placeholder="Cheque bounced on 12 Sep"
                      disabled={readOnly || !canHold}
                    />
                  )}
                </Field>
              )}
            </div>
          </section>
        )}

        <AddressFields form={form} disabled={readOnly} />

        <section className="grid gap-4">
          <Field label="Notes" error={errors.notes?.message}>
            {(props) => (
              <Textarea {...props} {...form.register('notes')} rows={2} disabled={readOnly} />
            )}
          </Field>

          <label className="flex items-start gap-3 text-sm">
            <Switch
              checked={Boolean(isActive)}
              onCheckedChange={(next) => form.setValue('isActive', next, { shouldDirty: true })}
              disabled={readOnly}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">
                Inactive {PARTY_ROLE_LABELS[role].many.toLowerCase()} drop out of pickers. Their
                history and balance are kept.
              </span>
            </span>
          </label>
        </section>
      </form>
    </Dialog>
  );
}

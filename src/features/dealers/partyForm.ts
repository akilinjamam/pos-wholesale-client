import { z } from 'zod';

import { fromMinor, toMinor } from '@shared/money';
import { createCustomerSchema, createDealerSchema } from '@shared/party';

import type { CreatePartyBody } from '@/api/endpoints/parties';
import type { PartyPayload } from '@shared/types';

/**
 * The dealer / customer form.
 *
 * Two layers, deliberately:
 *
 *  1. **This schema** describes the *form's* shape — every input a plain string, boolean or
 *     number, `''` for "not given", money in major units. That is what native inputs produce and
 *     what react-hook-form binds to.
 *  2. **The rules** are not re-declared. `superRefine` builds the exact request body the form
 *     would send and runs the server's own schema from `@shared/party` over it, then maps each
 *     issue back to the input it came from. A phone format, a reserved code shape, "only one
 *     default billing address" — each is written once, and the form cannot accept what the API
 *     would refuse.
 */

export type EditableRole = 'DEALER' | 'CUSTOMER';

const addressForm = z.object({
  label: z.string(),
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  district: z.string(),
  contactName: z.string(),
  phone: z.string(),
  isDefaultBilling: z.boolean(),
  isDefaultShipping: z.boolean(),
});

export type AddressFormValues = z.infer<typeof addressForm>;

/** `valueAsNumber` gives NaN for an empty box — say so in words rather than "received nan". */
const numberInput = z.number({ invalid_type_error: 'Enter a number' });

const dealerForm = z.object({
  priceTierId: z.string(),
  /** Major units: nobody types 5000000 for ৳50,000. */
  creditLimit: numberInput.min(0, 'Cannot be negative').max(999_999_999),
  paymentTermsDays: numberInput,
  discountPct: numberInput,
  salespersonUserId: z.string(),
  territory: z.string(),
  since: z.string(),
  creditHold: z.boolean(),
  creditHoldReason: z.string(),
});

const baseForm = z.object({
  role: z.enum(['DEALER', 'CUSTOMER']),
  /** Only sent on create, and only when typed — see `toRequestBody`. */
  code: z.string(),
  name: z.string(),
  displayName: z.string(),
  phone: z.string(),
  email: z.string(),
  tin: z.string(),
  bin: z.string(),
  tradeLicenseNo: z.string(),
  notes: z.string(),
  /** Comma-separated in the input; an array on the wire. */
  tagsText: z.string(),
  isActive: z.boolean(),
  addresses: z.array(addressForm),
  dealer: dealerForm,
});

export type PartyFormValues = z.infer<typeof baseForm>;

/** `''` → null: an emptied input means "clear it", not "set it to an empty string". */
const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export interface ToBodyOptions {
  /** On edit the code is omitted — it is immutable, and the server refuses a change anyway. */
  isEdit: boolean;
}

/** Form values → the body the role's endpoint accepts. Money back to minor units. */
export function toRequestBody(
  values: PartyFormValues,
  { isEdit }: ToBodyOptions,
): CreatePartyBody {
  const tags = values.tagsText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const common = {
    ...(isEdit || values.code.trim() === '' ? {} : { code: values.code.trim() }),
    name: values.name.trim(),
    displayName: orNull(values.displayName),
    phone: orNull(values.phone),
    email: orNull(values.email),
    tin: orNull(values.tin),
    bin: orNull(values.bin),
    tradeLicenseNo: orNull(values.tradeLicenseNo),
    notes: orNull(values.notes),
    tags: [...new Set(tags)],
    isActive: values.isActive,
    addresses: values.addresses.map((a) => ({
      label: a.label.trim(),
      line1: a.line1.trim(),
      line2: orNull(a.line2),
      city: orNull(a.city),
      district: orNull(a.district),
      contactName: orNull(a.contactName),
      phone: orNull(a.phone),
      isDefaultBilling: a.isDefaultBilling,
      isDefaultShipping: a.isDefaultShipping,
    })),
  };

  if (values.role === 'CUSTOMER') return common;

  const d = values.dealer;
  return {
    ...common,
    dealer: {
      priceTierId: orNull(d.priceTierId),
      // NaN would survive `toMinor` as NaN and fail the shared schema with a confusing message;
      // the form schema has already said "Enter a number" by then, so 0 is only a placeholder.
      creditLimitMinor: Number.isFinite(d.creditLimit) ? toMinor(d.creditLimit) : 0,
      paymentTermsDays: d.paymentTermsDays,
      discountPct: d.discountPct,
      salespersonUserId: orNull(d.salespersonUserId),
      territory: orNull(d.territory),
      since: orNull(d.since),
      creditHold: d.creditHold,
      // Only meaningful while on hold. Sending a leftover reason with the hold off would be
      // recorded by the server as a change to a gated field the user never touched.
      creditHoldReason: d.creditHold ? orNull(d.creditHoldReason) : null,
    },
  };
}

/**
 * Where a server-side (or shared-schema) path lands on this form. Everything not listed maps to
 * itself, because the form mirrors the API's names wherever the value is the same.
 */
export function serverPathToForm(path: string): string {
  if (path === 'dealer.creditLimitMinor') return 'dealer.creditLimit';
  if (path === 'tags' || path.startsWith('tags.')) return 'tagsText';
  return path;
}

export const partyFormSchema = baseForm.superRefine((values, ctx) => {
  const schema = values.role === 'DEALER' ? createDealerSchema : createCustomerSchema;
  // Parsed as a create even when editing: the rules for each field are the same, and the one
  // difference — `code` — is simply omitted from an edit's body.
  const result = schema.safeParse(toRequestBody(values, { isEdit: false }));
  if (result.success) return;

  for (const issue of result.error.issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: serverPathToForm(issue.path.join('.')).split('.'),
      message: issue.message,
    });
  }
});

export const emptyAddress: AddressFormValues = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  district: '',
  contactName: '',
  phone: '',
  isDefaultBilling: false,
  isDefaultShipping: false,
};

export interface FormDefaults {
  /** `org.settings.defaultPaymentTermsDays` — what a new dealer's terms start at. */
  defaultTermsDays: number;
}

/** A party → form values; `null` gives a blank form for the role. */
export function toFormValues(
  role: EditableRole,
  party: PartyPayload | null,
  { defaultTermsDays }: FormDefaults,
): PartyFormValues {
  const d = party?.dealer;

  return {
    role,
    code: party?.code ?? '',
    name: party?.name ?? '',
    displayName: party?.displayName ?? '',
    phone: party?.phone ?? '',
    email: party?.email ?? '',
    tin: party?.tin ?? '',
    bin: party?.bin ?? '',
    tradeLicenseNo: party?.tradeLicenseNo ?? '',
    notes: party?.notes ?? '',
    tagsText: (party?.tags ?? []).join(', '),
    isActive: party?.isActive ?? true,
    addresses: (party?.addresses ?? []).map((a) => ({
      label: a.label,
      line1: a.line1,
      line2: a.line2 ?? '',
      city: a.city ?? '',
      district: a.district ?? '',
      contactName: a.contactName ?? '',
      phone: a.phone ?? '',
      isDefaultBilling: a.isDefaultBilling,
      isDefaultShipping: a.isDefaultShipping,
    })),
    dealer: {
      priceTierId: d?.priceTierId ?? '',
      creditLimit: d ? fromMinor(d.creditLimitMinor) : 0,
      paymentTermsDays: d?.paymentTermsDays ?? defaultTermsDays,
      discountPct: d?.discountPct ?? 0,
      salespersonUserId: d?.salespersonUserId ?? '',
      territory: d?.territory ?? '',
      since: d?.since ?? '',
      creditHold: d?.creditHold ?? false,
      creditHoldReason: d?.creditHoldReason ?? '',
    },
  };
}

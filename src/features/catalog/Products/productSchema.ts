import { z } from 'zod';

import { normaliseAttrs, productAttrsSchema } from '@shared/catalog';
import { BASE_UOMS, PACK_CODES, PRODUCT_TYPES, TRACKING_MODES } from '@shared/enums';
import { fromMinor, toMinor } from '@shared/money';
import { validatePacks } from '@shared/uom';

import type { CreateProductBody } from '@/api/endpoints/products';
import type { ProductType } from '@shared/enums';
import type { ProductPayload } from '@shared/types';

/**
 * The product form's schema.
 *
 * The attribute half is **not** re-declared here — it is `productAttrsSchema` from
 * `@shared/catalog`, the same object the server validates request bodies with. That is the
 * point of the shared contract: a rule like "a progressive lens needs an addition range" is
 * written once and enforced in both places, so the form cannot accept something the API will
 * reject, nor reject something it would accept.
 *
 * The union is applied in a `superRefine` rather than as a plain field because it needs its
 * discriminant, and the form does not carry one inside `attrs` — `type` is a sibling. Injecting
 * it here mirrors `parseAttrs` on the server exactly, down to stripping `type` back out of the
 * issue paths so an error lands on a field the user can actually see.
 */

/** Money is edited in major units — nobody types 450000 for ৳4,500. */
const money = z.number().min(0, 'Cannot be negative').max(99_999_999);
const count = z.number().int('Whole numbers only').min(0, 'Cannot be negative');

export const productFormSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, 'Required')
      .max(40)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Letters, digits, dot, dash and underscore'),
    name: z.string().trim().min(1, 'Required').max(160),
    type: z.enum(PRODUCT_TYPES),

    // '' is the "not chosen" value a native <select> gives us; it becomes null on submit.
    brandId: z.string(),
    categoryId: z.string(),

    description: z.string().trim().max(2000),
    barcode: z.string().trim().max(60),
    hsCode: z.string().trim().max(20),

    baseUom: z.enum(BASE_UOMS),
    packs: z.array(
      z.object({
        code: z.enum(PACK_CODES),
        name: z.string().trim().min(1, 'Required').max(30),
        factor: z.number().int('Whole numbers only').min(2, 'At least 2').max(100_000),
        barcode: z.string().trim().max(60),
      }),
    ),
    trackingMode: z.enum(TRACKING_MODES),

    hasVariants: z.boolean(),
    variantAxes: z.array(z.string()),

    taxRatePct: z.number().min(0).max(100),

    mrp: money,
    sellPrice: money,
    standardCost: money,

    reorderPoint: count,
    reorderQty: count,
    leadTimeDays: count.max(365),

    isActive: z.boolean(),
    isSellableAtCounter: z.boolean(),
    isSellableWholesale: z.boolean(),

    attrs: z.record(z.unknown()),
  })
  .superRefine((values, ctx) => {
    // A grid the user has cleared is no grid — see `normaliseAttrs`. Without this, emptying
    // the power range leaves an object of nulls that fails its own required fields, with no
    // way back to "this lens has no declared range".
    const result = productAttrsSchema.safeParse(
      normaliseAttrs({ ...values.attrs, type: values.type }),
    );

    if (!result.success) {
      for (const issue of result.error.issues) {
        // `.strict()` reports unknown keys as one issue with an empty path — split it per key
        // so the offending input is the one that lights up, exactly as the server does.
        if (issue.code === 'unrecognized_keys') {
          for (const key of issue.keys) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['attrs', key],
              message: 'Not a field of this product type',
            });
          }
          continue;
        }

        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          // Drop the injected discriminant: the form has no `attrs.type` input to point at.
          path: ['attrs', ...issue.path.filter((p) => p !== 'type')],
          message: issue.message,
        });
      }
    }

    // The same three rules the server applies, from the same function — so a pack the form
    // accepts is a pack the API accepts, and the messages match.
    for (const problem of validatePacks(values.baseUom, values.packs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packs', problem.index, problem.field],
        message: problem.message,
      });
    }

    if (values.hasVariants && values.variantAxes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variantAxes'],
        message: 'Choose at least one axis, or turn variants off',
      });
    }
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

/**
 * A blank attribute set for a type.
 *
 * Switching type must *replace* `attrs`, not merge into it: the union is strict, so a leftover
 * `refractiveIndex` from a lens would make the frame it became permanently invalid — with the
 * error on a field no longer on screen.
 *
 * Only the fields the union requires are seeded; everything else has a default in the schema.
 */
export function emptyAttrsFor(type: ProductType): Record<string, unknown> {
  switch (type) {
    case 'LENS':
      // `material` and `design` have no default — a lens is not describable without them.
      return { material: 'CR39', design: 'SV', soldAs: 'PAIR' };
    case 'ACCESSORY':
      return { requiresExpiry: false };
    case 'MACHINE':
      return { installationRequired: false };
    default:
      return { polarized: false, uvProtection: false, hasCase: false };
  }
}

/** An existing product → form values. Money comes back to major units for editing. */
export function toFormValues(product: ProductPayload | null): ProductFormValues {
  if (!product) {
    return {
      sku: '',
      name: '',
      type: 'FRAME',
      brandId: '',
      categoryId: '',
      description: '',
      barcode: '',
      hsCode: '',
      baseUom: 'PCS',
      packs: [],
      trackingMode: 'NONE',
      hasVariants: false,
      variantAxes: [],
      taxRatePct: 0,
      mrp: 0,
      sellPrice: 0,
      standardCost: 0,
      reorderPoint: 0,
      reorderQty: 0,
      leadTimeDays: 0,
      isActive: true,
      isSellableAtCounter: true,
      isSellableWholesale: true,
      attrs: emptyAttrsFor('FRAME'),
    };
  }

  // `type` is stripped: it lives as a sibling on the form, and leaving a copy inside `attrs`
  // would fail the strict union on the way back out.
  const { type: _discriminant, ...attrs } = product.attrs;

  return {
    sku: product.sku,
    name: product.name,
    type: product.type,
    brandId: product.brandId ?? '',
    categoryId: product.categoryId ?? '',
    description: product.description ?? '',
    barcode: product.barcode ?? '',
    hsCode: product.hsCode ?? '',
    baseUom: product.baseUom,
    packs: product.packs.map((pack) => ({
      code: pack.code,
      name: pack.name,
      factor: pack.factor,
      barcode: pack.barcode ?? '',
    })),
    trackingMode: product.trackingMode,
    hasVariants: product.hasVariants,
    variantAxes: product.variantAxes,
    taxRatePct: product.taxRatePct,
    mrp: fromMinor(product.mrpMinor),
    sellPrice: fromMinor(product.defaultSellPriceMinor),
    // Absent entirely for a caller without `stock:viewCost` — see `ProductPayload`.
    standardCost: fromMinor(product.standardCostMinor ?? 0),
    reorderPoint: product.reorderPoint,
    reorderQty: product.reorderQty,
    leadTimeDays: product.leadTimeDays,
    isActive: product.isActive,
    isSellableAtCounter: product.isSellableAtCounter,
    isSellableWholesale: product.isSellableWholesale,
    attrs: attrs as Record<string, unknown>,
  };
}

/**
 * Form values → request body.
 *
 * `standardCostMinor` is sent only when the user could see it: a storekeeper editing a product
 * never receives the cost, so submitting `0` would silently wipe it.
 */
export function toRequestBody(
  values: ProductFormValues,
  options: { includeCost: boolean },
): CreateProductBody {
  return {
    sku: values.sku.toUpperCase(),
    name: values.name,
    type: values.type,
    brandId: values.brandId || null,
    categoryId: values.categoryId || null,
    description: values.description || null,
    barcode: values.barcode || null,
    hsCode: values.hsCode || null,
    baseUom: values.baseUom,
    packs: values.packs.map((pack) => ({
      code: pack.code,
      name: pack.name,
      factor: pack.factor,
      // '' is the empty input; the API wants null, and a '' would claim a real barcode.
      barcode: pack.barcode.trim() === '' ? null : pack.barcode.trim(),
    })),
    trackingMode: values.trackingMode,
    hasVariants: values.hasVariants,
    variantAxes: values.hasVariants ? values.variantAxes : [],
    taxRatePct: values.taxRatePct,
    mrpMinor: toMinor(values.mrp),
    defaultSellPriceMinor: toMinor(values.sellPrice),
    ...(options.includeCost ? { standardCostMinor: toMinor(values.standardCost) } : {}),
    reorderPoint: values.reorderPoint,
    reorderQty: values.reorderQty,
    leadTimeDays: values.leadTimeDays,
    isActive: values.isActive,
    isSellableAtCounter: values.isSellableAtCounter,
    isSellableWholesale: values.isSellableWholesale,
    attrs: normaliseAttrs(values.attrs),
  };
}

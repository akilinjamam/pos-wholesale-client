import type { ProductFormValues } from '../productSchema';
import type { FieldPath, UseFormReturn } from 'react-hook-form';

export type AttrsForm = UseFormReturn<ProductFormValues>;

/**
 * `attrs` is typed as `Record<string, unknown>` on the form — its shape depends on `type`,
 * which TypeScript cannot know here — so paths into it are `attrs.${string}`. That is a legal
 * `FieldPath`, resolved by react-hook-form at runtime; the real type safety lives in the shared
 * union that validates the values.
 */
export type AttrPath = FieldPath<ProductFormValues>;

/**
 * The message react-hook-form recorded for a path, if any.
 *
 * `form.formState.errors` is a nested object mirroring the form's shape, so a dotted path has
 * to be walked rather than indexed. Returning `undefined` for anything that is not a leaf error
 * keeps the callers free of optional-chaining noise.
 */
export function errorAt(form: AttrsForm, name: AttrPath): string | undefined {
  let node: unknown = form.formState.errors;

  for (const part of name.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }

  if (node && typeof node === 'object' && 'message' in node) {
    const message = (node as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

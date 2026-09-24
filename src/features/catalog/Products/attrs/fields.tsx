import { useWatch } from 'react-hook-form';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { humanise } from '@/lib/utils';

import { errorAt } from './helpers';

import type { AttrPath, AttrsForm } from './helpers';

/**
 * The small set of controls every attribute section is built from.
 *
 * They exist because the four sections would otherwise repeat the same twenty lines of
 * register/coerce/error wiring per field, and the numeric coercion in particular is the kind of
 * detail that is wrong in one place out of thirty.
 *
 * `attrs` is typed as `Record<string, unknown>` on the form — the shape depends on `type`, which
 * TypeScript cannot know at this point — so paths into it are `attrs.${string}`. That is a
 * legal `FieldPath` and react-hook-form resolves it at runtime; the values are validated by the
 * shared union, which is where the real type safety lives.
 */

export function TextField({
  form,
  name,
  label,
  hint,
  placeholder,
}: {
  form: AttrsForm;
  name: AttrPath;
  label: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint} error={errorAt(form, name)}>
      {(props) => (
        <Input
          {...props}
          {...form.register(name)}
          placeholder={placeholder}
          autoComplete="off"
        />
      )}
    </Field>
  );
}

export function NumberField({
  form,
  name,
  label,
  hint,
  step,
  placeholder,
}: {
  form: AttrsForm;
  name: AttrPath;
  label: string;
  hint?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint} error={errorAt(form, name)}>
      {(props) => (
        <Input
          {...props}
          {...form.register(name, {
            // An empty box means "not given", which the union models as null — NOT as 0. A
            // frame with `eye: 0` claims a 0mm lens width; one with `eye: null` says nothing.
            // A non-numeric string is passed through so zod reports it rather than storing NaN.
            setValueAs: (v: unknown) => {
              if (v === '' || v === null || v === undefined) return null;
              const n = Number(v);
              return Number.isNaN(n) ? v : n;
            },
          })}
          type="number"
          step={step ?? '1'}
          placeholder={placeholder}
          autoComplete="off"
        />
      )}
    </Field>
  );
}

export function SelectField({
  form,
  name,
  label,
  options,
  hint,
  placeholder = '—',
}: {
  form: AttrsForm;
  name: AttrPath;
  label: string;
  options: readonly string[];
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint} error={errorAt(form, name)}>
      {(props) => (
        <Select
          {...props}
          {...form.register(name, {
            // '' is what the placeholder option submits; the union wants null for "not given".
            setValueAs: (v: unknown) => (v === '' ? null : v),
          })}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {humanise(option)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function BoolField({
  form,
  name,
  label,
  hint,
}: {
  form: AttrsForm;
  name: AttrPath;
  label: string;
  hint?: string;
}) {
  // `useWatch`, not `form.watch` — the latter defeats the React Compiler, which then skips
  // memoising the whole section.
  const value = useWatch({ control: form.control, name });

  return (
    <label className="flex items-start gap-2 py-1.5 text-sm">
      <Switch
        checked={Boolean(value)}
        onCheckedChange={(next) =>
          form.setValue(name, next as never, { shouldDirty: true, shouldValidate: true })
        }
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

import { Plus, Trash2 } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

import { errorAt } from './attrs/helpers';

import { PACK_CODES } from '@shared/enums';
import { describeQty } from '@shared/uom';

import type { ProductFormValues } from './productSchema';
import type { AttrPath } from './attrs/helpers';
import type { UseFormReturn } from 'react-hook-form';

/**
 * Pack units — multiplier-only aliases for the base unit.
 *
 * The trade quotes frames by the dozen and ships cartons, but every stock figure, ledger row
 * and report in this system is in base units. A pack is therefore nothing more than a name and
 * an integer: `DOZ` ×12, `CTN` ×144. There is no unit graph and no dimensional analysis,
 * because two levels and a multiplier is what the business actually uses.
 *
 * The live conversion under each row is the point of the component. "A dealer ordering 5 dozen
 * and the system recording 5 pieces" is the bug this whole area exists to prevent, and the
 * cheapest defence is showing the person entering the factor exactly what it will mean.
 */
/**
 * The name and factor each pack code normally carries.
 *
 * Both are editable — a "carton" is 144 in one supplier's catalogue and 120 in another's, which
 * is exactly why `factor` is per-product data rather than a constant. These are the starting
 * points, so the common case is a click.
 */
const PACK_PRESETS: Record<string, { name: string; factor: number }> = {
  DOZ: { name: 'Dozen', factor: 12 },
  CTN: { name: 'Carton', factor: 144 },
  BOX: { name: 'Box', factor: 10 },
  PAIR: { name: 'Pair', factor: 2 },
  PCS: { name: 'Piece', factor: 2 },
};

export function PackEditor({ form }: { form: UseFormReturn<ProductFormValues> }) {
  const packs = useWatch({ control: form.control, name: 'packs' }) ?? [];
  const baseUom = useWatch({ control: form.control, name: 'baseUom' });

  /** Codes still available: not the base unit, and not already used by another row. */
  const availableFor = (index: number) =>
    PACK_CODES.filter(
      (code) => code !== baseUom && !packs.some((p, i) => i !== index && p.code === code),
    );

  const add = () => {
    // Offered in the order the trade actually uses them, not the order the enum happens to
    // list them in — a first "Add pack" should propose a dozen, not a pair.
    const preference: readonly string[] = ['DOZ', 'CTN', 'BOX', 'PAIR', 'PCS'];
    const free = availableFor(-1);
    const code = preference.find((c) => free.includes(c as never)) ?? free[0];
    if (!code) return;

    const preset = PACK_PRESETS[code];

    form.setValue(
      'packs',
      [
        ...packs,
        // A default that is usually right beats an empty box that is always wrong — but it has
        // to match the code, or you get a PAIR labelled "Dozen" holding twelve.
        { code: code as never, name: preset.name, factor: preset.factor, barcode: '' },
      ],
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const remove = (index: number) => {
    form.setValue(
      'packs',
      packs.filter((_, i) => i !== index),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const canAdd = availableFor(-1).length > 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Pack units</p>
          <p className="text-xs text-muted-foreground">
            Aliases for {baseUom}. Stock is always counted in {baseUom}; packs only change how a
            quantity is quoted and ordered.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!canAdd}>
          <Plus aria-hidden="true" />
          Add pack
        </Button>
      </div>

      {packs.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No packs — this product is ordered in {baseUom} only.
        </p>
      ) : (
        <div className="space-y-2">
          {packs.map((pack, index) => {
            const factorError = errorAt(form, `packs.${index}.factor` as AttrPath);
            const codeError = errorAt(form, `packs.${index}.code` as AttrPath);
            const nameError = errorAt(form, `packs.${index}.name` as AttrPath);
            const barcodeError = errorAt(form, `packs.${index}.barcode` as AttrPath);

            return (
              <div key={index} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="space-y-1">
                    <span className="block text-xs font-medium">Unit</span>
                    <Select
                      {...form.register(`packs.${index}.code` as const)}
                      className="w-28"
                      aria-invalid={Boolean(codeError)}
                    >
                      {/* The current value stays selectable even when it clashes, so a bad row
                          can be seen and corrected rather than silently re-pointed. */}
                      {[...new Set([pack.code, ...availableFor(index)])].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="block text-xs font-medium">Name</span>
                    <Input
                      {...form.register(`packs.${index}.name` as const)}
                      className="w-32"
                      placeholder="Dozen"
                      aria-invalid={Boolean(nameError)}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-xs font-medium">{baseUom} per pack</span>
                    <Input
                      {...form.register(`packs.${index}.factor` as const, {
                        valueAsNumber: true,
                      })}
                      type="number"
                      min={2}
                      className="w-28"
                      aria-invalid={Boolean(factorError)}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block text-xs font-medium">Barcode</span>
                    <Input
                      {...form.register(`packs.${index}.barcode` as const)}
                      className="w-44 font-mono"
                      placeholder="Optional"
                      aria-invalid={Boolean(barcodeError)}
                    />
                  </label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:bg-destructive/10"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${pack.code}`}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {/* What the factor actually means, in the words an order line will use. */}
                {Number.isInteger(pack.factor) && pack.factor >= 2 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    1 {pack.code} = {pack.factor} {baseUom} · 5 {pack.code} = {5 * pack.factor}{' '}
                    {baseUom}
                    {packs.length > 1 && (
                      <>
                        {' '}
                        · 150 {baseUom} ={' '}
                        {describeQty(150, {
                          baseUom,
                          packs: packs
                            .filter((p) => Number.isInteger(p.factor) && p.factor >= 2)
                            .map((p) => ({ code: p.code, name: p.name, factor: p.factor })),
                        })}
                      </>
                    )}
                  </p>
                )}

                {[codeError, nameError, factorError, barcodeError]
                  .filter(Boolean)
                  .map((message, i) => (
                    <p
                      key={i}
                      role="alert"
                      className="mt-1 text-xs font-medium text-destructive"
                    >
                      {message}
                    </p>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

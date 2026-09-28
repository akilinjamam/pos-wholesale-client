import { Plus, Trash2 } from 'lucide-react';

import { ProductPicker } from '@/components/common/ProductPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useVariants } from '@/hooks/data/useVariants';

import { emptyLine, parseSerials } from './stockLines';

import { packFactor, uomOptions } from '@shared/uom';

import type { LineDraft } from './stockLines';

/**
 * The line grid for adjustments and transfers.
 *
 * Each row adapts to the product it holds, because what a line needs depends on how the product
 * is tracked — and the server refuses a line that lacks it, so the form asks up front:
 *
 *  - a product with variants needs a variant (stock is kept per variant);
 *  - LOT-tracked needs a lot number, and — for stock *arriving* — the box's expiry or mfg date;
 *  - SERIAL-tracked needs one serial per unit; the counter under the box shows "2 of 3" live.
 *
 * Server field errors (`lines.2.serials`) arrive keyed by path and are shown on that row's field.
 */

export interface StockLinesEditorProps {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  /** Adjustments allow − (written off); transfers only move positive quantities. */
  signed: boolean;
  /** Ask for expiry/mfg dates on positive lot lines — stock arriving creates the lot. */
  inboundLotDates: boolean;
  /** Server field errors keyed by path, e.g. `lines.0.qty`. */
  errors: Record<string, string>;
  disabled?: boolean;
}

export function StockLinesEditor({
  lines,
  onChange,
  signed,
  inboundLotDates,
  errors,
  disabled,
}: StockLinesEditorProps) {
  const update = (key: number, patch: Partial<LineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      {lines.map((line, i) => (
        <LineRow
          key={line.key}
          index={i}
          line={line}
          signed={signed}
          inboundLotDates={inboundLotDates}
          errors={errors}
          disabled={disabled}
          onChange={(patch) => update(line.key, patch)}
          onRemove={
            lines.length > 1
              ? () => onChange(lines.filter((l) => l.key !== line.key))
              : undefined
          }
        />
      ))}
      {errors.lines && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {errors.lines}
        </p>
      )}
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, emptyLine()])}
        >
          <Plus aria-hidden="true" />
          Add line
        </Button>
      )}
    </div>
  );
}

function LineRow({
  index,
  line,
  signed,
  inboundLotDates,
  errors,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineDraft;
  signed: boolean;
  inboundLotDates: boolean;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove?: () => void;
}) {
  const p = line.product;
  const { data: variants } = useVariants(
    { productId: p?.id ?? '', limit: 200 },
    Boolean(p?.hasVariants),
  );
  const err = (field: string) => errors[`lines.${index}.${field}`];
  const qtyNumber = Number(line.qty);
  const units = p ? uomOptions(p) : [];
  const factor = p ? (packFactor(p, line.uomCode || p.baseUom) ?? 1) : 1;
  const unitsNeeded = Number.isInteger(qtyNumber) ? Math.abs(qtyNumber) * factor : 0;
  const serialCount = parseSerials(line.serialsText).length;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_6rem_7rem_auto]">
        <div>
          <ProductPicker
            value={p}
            onChange={(next) =>
              onChange({
                product: next,
                variantId: '',
                uomCode: next?.baseUom ?? '',
                lotNo: '',
                serialsText: '',
              })
            }
            invalid={Boolean(err('productId'))}
            disabled={disabled}
            aria-describedby={undefined}
          />
          {err('productId') && (
            <p className="mt-1 text-xs font-medium text-destructive">{err('productId')}</p>
          )}
        </div>

        <div>
          {p?.hasVariants ? (
            <Select
              value={line.variantId}
              onChange={(e) => onChange({ variantId: e.target.value })}
              aria-label="Variant"
              aria-invalid={Boolean(err('variantId'))}
              disabled={disabled}
            >
              <option value="">Choose variant…</option>
              {(variants?.items ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          ) : (
            <p className="flex h-10 items-center text-xs text-muted-foreground">
              {p ? 'No variants' : ''}
            </p>
          )}
          {err('variantId') && (
            <p className="mt-1 text-xs font-medium text-destructive">{err('variantId')}</p>
          )}
        </div>

        <Select
          value={line.uomCode}
          onChange={(e) => onChange({ uomCode: e.target.value })}
          aria-label="Unit"
          disabled={disabled || units.length === 0}
        >
          {units.map((u) => (
            <option key={u.code} value={u.code}>
              {u.code}
              {u.factor > 1 ? ` ×${u.factor}` : ''}
            </option>
          ))}
        </Select>

        <div>
          <Input
            type="number"
            step={1}
            min={signed ? undefined : 1}
            value={line.qty}
            onChange={(e) => onChange({ qty: e.target.value })}
            placeholder={signed ? '+5 / −2' : 'Qty'}
            aria-label="Quantity"
            aria-invalid={Boolean(err('qty'))}
            className={cn('tabular-nums', signed && qtyNumber < 0 && 'text-destructive')}
            disabled={disabled}
          />
          {err('qty') && (
            <p className="mt-1 text-xs font-medium text-destructive">{err('qty')}</p>
          )}
        </div>

        {onRemove && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            aria-label={`Remove line ${index + 1}`}
          >
            <Trash2 />
          </Button>
        ) : (
          <span />
        )}
      </div>

      {p?.trackingMode === 'LOT' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Input
              value={line.lotNo}
              onChange={(e) => onChange({ lotNo: e.target.value })}
              placeholder="Lot number"
              className="font-mono uppercase"
              aria-label="Lot number"
              aria-invalid={Boolean(err('lotNo'))}
              disabled={disabled}
            />
            {err('lotNo') && (
              <p className="mt-1 text-xs font-medium text-destructive">{err('lotNo')}</p>
            )}
          </div>
          {inboundLotDates && qtyNumber > 0 && (
            <>
              <div>
                <Input
                  type="date"
                  value={line.expiryDate}
                  onChange={(e) => onChange({ expiryDate: e.target.value })}
                  aria-label="Expiry date"
                  title="Expiry date"
                  aria-invalid={Boolean(err('expiryDate'))}
                  disabled={disabled}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {err('expiryDate') ?? 'Expiry (from the box)'}
                </p>
              </div>
              <div>
                <Input
                  type="date"
                  value={line.mfgDate}
                  onChange={(e) => onChange({ mfgDate: e.target.value })}
                  aria-label="Manufacture date"
                  title="Manufacture date"
                  disabled={disabled}
                />
                <p className="mt-1 text-xs text-muted-foreground">Mfg date — optional</p>
              </div>
            </>
          )}
        </div>
      )}

      {p?.trackingMode === 'SERIAL' && (
        <div>
          <Textarea
            value={line.serialsText}
            onChange={(e) => onChange({ serialsText: e.target.value })}
            placeholder="One serial per line — scan them in"
            rows={Math.min(6, Math.max(2, unitsNeeded))}
            className="font-mono uppercase"
            aria-label="Serial numbers"
            aria-invalid={Boolean(err('serials'))}
            disabled={disabled}
          />
          <p
            className={cn(
              'mt-1 text-xs',
              err('serials')
                ? 'font-medium text-destructive'
                : serialCount === unitsNeeded
                  ? 'text-success'
                  : 'text-muted-foreground',
            )}
          >
            {err('serials') ?? `${serialCount} of ${unitsNeeded} serial(s)`}
          </p>
        </div>
      )}
    </div>
  );
}

import { ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { env } from '@/config/env';
import { humanise } from '@/lib/utils';
import { useBrands } from '@/hooks/data/useBrands';
import { useCategories } from '@/hooks/data/useCategories';
import { useBulkAdjustPrices } from '@/hooks/data/usePricing';

import { PRODUCT_TYPES } from '@shared/enums';
import { formatMoney } from '@shared/money';
import { ROUNDING_STEPS } from '@shared/pricing';

import type { PriceScope } from './scope';
import type { BulkAdjustResult } from '@shared/types';

/**
 * Raise or cut a whole price list by a percentage — the yearly "everything +8%".
 *
 * **Preview is mandatory.** The server's dry run says how many prices are in scope, how many
 * actually move (rounding can leave a cheap item where it was), and shows a sample of
 * before → after. *Apply* is only enabled against a preview of exactly the current inputs, so
 * what the user confirms is what gets written.
 *
 * Only active prices in force today or later are touched. An entry that has already ended is a
 * record of what was charged, and the server will not rewrite it.
 */
export interface BulkAdjustDialogProps {
  open: boolean;
  onClose: () => void;
  scope: PriceScope;
  scopeLabel: string;
}

const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });

const stepLabel = (minor: number) =>
  minor === 1
    ? 'No rounding'
    : `Nearest ${formatMoney(minor, { symbol: env.currencySymbol, alwaysShowMinor: false })}`;

export function BulkAdjustDialog({ open, onClose, scope, scopeLabel }: BulkAdjustDialogProps) {
  const adjust = useBulkAdjustPrices();
  const { data: brands } = useBrands({ limit: 200, isActive: true });
  const { data: categories } = useCategories({ limit: 200, isActive: true });

  const [pct, setPct] = useState('');
  const [roundTo, setRoundTo] = useState<number>(100);
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productType, setProductType] = useState('');
  const [preview, setPreview] = useState<BulkAdjustResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  const pctNumber = Number(pct);
  const pctValid =
    pct.trim() !== '' &&
    Number.isFinite(pctNumber) &&
    pctNumber !== 0 &&
    pctNumber >= -90 &&
    pctNumber <= 500;

  /** Any change to the inputs invalidates the preview — Apply must match what was shown. */
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreview(null);
    };

  const body = (dryRun: boolean) => ({
    ...scope,
    pct: pctNumber,
    roundToMinor: roundTo,
    brandId: brandId || null,
    categoryId: categoryId || null,
    productType: productType || null,
    dryRun,
  });

  const runPreview = () => {
    if (!pctValid) {
      setError('Between −90 and +500, and not 0');
      return;
    }
    setError(undefined);
    adjust.mutate(body(true), { onSuccess: setPreview });
  };

  const apply = () => adjust.mutate(body(false), { onSuccess: onClose });

  return (
    <Dialog
      open={open}
      onClose={adjust.isPending ? () => undefined : onClose}
      title={`Bulk adjust — ${scopeLabel}`}
      description="Changes every active price in force today or later. Ended prices are never rewritten."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          {preview && preview.changed > 0 ? (
            <Button onClick={apply} disabled={adjust.isPending}>
              {adjust.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Apply to {preview.changed} price(s)
            </Button>
          ) : (
            <Button onClick={runPreview} disabled={adjust.isPending}>
              {adjust.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Preview
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Change (%)"
            required
            error={error}
            hint="+8 raises by 8%; −5 cuts by 5%."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                step="0.1"
                value={pct}
                onChange={(e) => edit(setPct)(e.target.value)}
                autoFocus
              />
            )}
          </Field>
          <Field label="Round to">
            {(props) => (
              <Select
                {...props}
                value={String(roundTo)}
                onChange={(e) => edit(setRoundTo)(Number(e.target.value))}
              >
                {ROUNDING_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {stepLabel(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Only brand">
            {(props) => (
              <Select
                {...props}
                value={brandId}
                onChange={(e) => edit(setBrandId)(e.target.value)}
              >
                <option value="">All brands</option>
                {(brands?.items ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Only category">
            {(props) => (
              <Select
                {...props}
                value={categoryId}
                onChange={(e) => edit(setCategoryId)(e.target.value)}
              >
                <option value="">All categories</option>
                {(categories?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.breadcrumb.join(' › ')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Only type">
            {(props) => (
              <Select
                {...props}
                value={productType}
                onChange={(e) => edit(setProductType)(e.target.value)}
              >
                <option value="">All types</option>
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanise(t)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {preview && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-sm">
              <strong>{preview.changed}</strong> of {preview.matched} price(s) in scope will
              change
              {preview.matched > preview.changed &&
                ` — ${preview.matched - preview.changed} stay put after rounding`}
              .
            </p>
            {preview.sample.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="w-8" />
                      <TableHead className="text-right">After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                        <TableCell className="text-sm">
                          {s.uomCode} from {s.minQty}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {money(s.beforeMinor)}
                        </TableCell>
                        <TableCell>
                          <ArrowRight
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(s.afterMinor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus, ScanLine, Split, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useLotsInStock } from '@/hooks/data/usePos';
import { cn } from '@/lib/utils';

import { qtyText, splitRow } from './challanDraft';

import type { BoxDraft, PackRow, TransportDraft } from './challanDraft';

// ─── Pick & pack grid ───────────────────────────────────────────────────────────────────

/**
 * The challan's lines, editable while it is a draft: how many of each to send (up to what the
 * order has left), and the lot or serials as the product's tracking requires. Serials are scanned
 * one after another into the box — Enter after each, as a barcode scanner sends it.
 */
export function PackGrid({
  rows,
  onChange,
  outstanding,
  errors,
  editable,
}: {
  rows: PackRow[];
  onChange: (rows: PackRow[]) => void;
  /** Base units still to ship, per order line — the most a challan may carry. */
  outstanding: Map<string, number>;
  errors: Record<string, string>;
  editable: boolean;
}) {
  const reduce = useReducedMotion();
  const update = (key: number, patch: Partial<PackRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <ul className="divide-y rounded-lg border">
      <AnimatePresence initial={false}>
        {rows.map((r, i) => {
          const err = (f: string) => errors[`lines.${i}.${f}`];
          const left = outstanding.get(r.orderLineId);
          const siblings = rows.filter((x) => x.orderLineId === r.orderLineId);
          const onLine = siblings.reduce((s, x) => s + x.qtyBase, 0);
          const over = left !== undefined && onLine > left;
          return (
            <motion.li
              key={r.key}
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 16, height: 0 }}
              transition={{ duration: 0.16 }}
              className="space-y-2 px-3 py-3"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.line.productName}</p>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{r.line.sku}</span>
                    {r.line.trackingMode !== 'NONE' && (
                      <Badge variant="outline" className="ml-2 py-0">
                        {r.line.trackingMode === 'SERIAL' ? 'serialised' : 'lot-tracked'}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="w-28">
                  {editable ? (
                    <Input
                      type="number"
                      min={1}
                      value={r.qtyBase}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        if (n >= 1) update(r.key, { qtyBase: n });
                      }}
                      aria-invalid={over || Boolean(err('qtyBase'))}
                      className="h-9 text-right tabular-nums"
                      aria-label={`Base units of ${r.line.sku}`}
                    />
                  ) : (
                    <p className="pt-1.5 text-right font-medium tabular-nums">{r.qtyBase}</p>
                  )}
                </div>
                <div className="w-36 pt-1.5 text-sm tabular-nums">
                  <p>{qtyText({ ...r.line, qtyBase: r.qtyBase })}</p>
                  {left !== undefined && (
                    <p
                      className={cn(
                        'text-xs',
                        over ? 'font-medium text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {over ? `only ${left} left to ship` : `of ${left} left`}
                    </p>
                  )}
                </div>
                {editable && (
                  <div className="flex gap-1">
                    {r.line.trackingMode === 'LOT' && r.qtyBase > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Split across two lots"
                        aria-label={`Split ${r.line.sku} across two lots`}
                        onClick={() => onChange(splitRow(rows, r.key))}
                      >
                        <Split />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      disabled={rows.length === 1}
                      aria-label={`Leave ${r.line.sku} off this challan`}
                      onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>

              {r.line.trackingMode === 'LOT' && (
                <LotField
                  productId={r.line.productId}
                  value={r.lotNo}
                  editable={editable}
                  error={err('lotNo')}
                  onChange={(lotNo) => update(r.key, { lotNo })}
                />
              )}
              {r.line.trackingMode === 'SERIAL' && (
                <SerialScanner
                  serials={r.serials}
                  needed={r.qtyBase}
                  editable={editable}
                  error={err('serials')}
                  onChange={(serials) => update(r.key, { serials })}
                />
              )}
              {(err('qtyBase') ?? err('orderLineId')) && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {err('qtyBase') ?? err('orderLineId')}
                </p>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function LotField({
  productId,
  value,
  editable,
  error,
  onChange,
}: {
  productId: string;
  value: string;
  editable: boolean;
  error?: string;
  onChange: (lotNo: string) => void;
}) {
  const lots = useLotsInStock(editable ? productId : null);
  const listId = `lots-${productId}`;
  if (!editable) {
    return (
      <p className="text-sm">
        Lot <span className="font-mono">{value || '—'}</span>
      </p>
    );
  }
  return (
    <div className="flex max-w-sm items-center gap-2">
      <label className="text-xs text-muted-foreground" htmlFor={`${listId}-in`}>
        Lot
      </label>
      <Input
        id={`${listId}-in`}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="Scan or type the lot number"
        aria-invalid={Boolean(error)}
        className="h-8 font-mono"
      />
      <datalist id={listId}>
        {(lots.data ?? []).map((l) => (
          <option key={l.id} value={l.lotNo}>
            {l.expiryDate ? `exp ${l.expiryDate.slice(0, 10)}` : ''}
          </option>
        ))}
      </datalist>
      {error && <span className="text-xs font-medium text-destructive">{error}</span>}
    </div>
  );
}

function SerialScanner({
  serials,
  needed,
  editable,
  error,
  onChange,
}: {
  serials: string[];
  needed: number;
  editable: boolean;
  error?: string;
  onChange: (serials: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [dupe, setDupe] = useState<string | null>(null);
  const done = serials.length === needed;
  const add = () => {
    const sn = text.trim().toUpperCase();
    if (!sn) return;
    if (serials.includes(sn)) {
      setDupe(sn);
    } else if (serials.length < needed) {
      onChange([...serials, sn]);
      setDupe(null);
    }
    setText('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'text-xs font-medium tabular-nums',
            done ? 'text-success' : 'text-warning',
          )}
        >
          {serials.length} of {needed} scanned
        </span>
        {serials.map((sn) => (
          <Badge key={sn} variant="secondary" className="gap-1 font-mono">
            {sn}
            {editable && (
              <button
                type="button"
                aria-label={`Remove ${sn}`}
                onClick={() => onChange(serials.filter((x) => x !== sn))}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {editable && !done && (
        <div className="flex max-w-sm items-center gap-2">
          <ScanLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Scan a serial, Enter"
            className="h-8 font-mono"
            aria-label="Scan a serial number"
          />
        </div>
      )}
      {dupe && <p className="text-xs text-warning">{dupe} is already scanned</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Transport and boxes ────────────────────────────────────────────────────────────────

export function TransportFields({
  value,
  onChange,
  disabled,
}: {
  value: TransportDraft;
  onChange: (t: TransportDraft) => void;
  disabled?: boolean;
}) {
  const set = (p: Partial<TransportDraft>) => onChange({ ...value, ...p });
  const field = (label: string, key: keyof TransportDraft, placeholder = '') => (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        value={value[key]}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value } as Partial<TransportDraft>)}
        className="h-9"
      />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">Sent by</span>
        <Select
          value={value.mode}
          disabled={disabled}
          onChange={(e) => set({ mode: e.target.value as TransportDraft['mode'] })}
          className="h-9"
        >
          <option value="">Not decided yet</option>
          <option value="OWN">Own vehicle</option>
          <option value="COURIER">Courier</option>
          <option value="BUS">Bus / coach</option>
        </Select>
      </label>
      {value.mode === 'COURIER' ? (
        <>
          {field('Courier', 'courierName', 'e.g. Sundarban')}
          {field('Tracking / booking no.', 'trackingNo')}
        </>
      ) : (
        <>
          {field('Vehicle no.', 'vehicleNo', 'e.g. DHAKA METRO GA-11-2233')}
          {field(
            value.mode === 'BUS' ? 'Bus company' : 'Driver',
            value.mode === 'BUS' ? 'courierName' : 'driverName',
          )}
        </>
      )}
      {value.mode !== 'COURIER' && field('Driver phone', 'driverPhone')}
      {value.mode === 'BUS' && field('Booking no.', 'trackingNo')}
      <label className="space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">Freight (৳)</span>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value.freight}
          disabled={disabled || !value.mode}
          onChange={(e) => set({ freight: e.target.value })}
          className="h-9 text-right tabular-nums"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">Freight paid by</span>
        <Select
          value={value.freightPaidBy}
          disabled={disabled || !value.mode}
          onChange={(e) => set({ freightPaidBy: e.target.value as 'US' | 'DEALER' })}
          className="h-9"
        >
          <option value="US">Us (absorbed)</option>
          <option value="DEALER">Dealer (added to the invoice)</option>
        </Select>
      </label>
    </div>
  );
}

export function BoxesEditor({
  boxes,
  onChange,
  disabled,
}: {
  boxes: BoxDraft[];
  onChange: (b: BoxDraft[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {boxes.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={b.boxNo}
            disabled={disabled}
            onChange={(e) =>
              onChange(boxes.map((x, j) => (j === i ? { ...x, boxNo: e.target.value } : x)))
            }
            className="h-8 w-28"
            aria-label={`Box ${i + 1} label`}
          />
          <Input
            type="number"
            min={0}
            step="0.1"
            value={b.weightKg}
            disabled={disabled}
            placeholder="kg"
            onChange={(e) =>
              onChange(boxes.map((x, j) => (j === i ? { ...x, weightKg: e.target.value } : x)))
            }
            className="h-8 w-24 text-right tabular-nums"
            aria-label={`Box ${i + 1} weight in kg`}
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Remove box ${i + 1}`}
              onClick={() => onChange(boxes.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...boxes, { boxNo: `Box ${boxes.length + 1}`, weightKg: '' }])
          }
        >
          <Plus aria-hidden="true" />
          Add box
        </Button>
      )}
    </div>
  );
}

import { CheckCircle2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useHeldSales, useLotsInStock } from '@/hooks/data/usePos';
import { useVariants } from '@/hooks/data/useVariants';

import { ReceiptButtons } from '../print/PrintControls';

import { money, SHORTCUTS } from './saleHelpers';

import type { CartLine } from '@/store/posCartSlice';
import type { HeldSalePayload, PosSaleResult, VariantPayload } from '@shared/types';

/**
 * The till's small dialogs. Every one is driven from the keyboard — arrows to move, Enter to
 * choose, Escape to back out — and hands focus back to the scan bar when it closes.
 */

/** ↑/↓/Enter over a list — the one pattern every picker here shares. */
function useListKeys<T>(items: T[], onPick: (item: T) => void) {
  const [active, setActive] = useState(0);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      onPick(items[active]);
    }
  };
  return { active: Math.min(active, Math.max(0, items.length - 1)), setActive, onKeyDown };
}

// ─── Variant ────────────────────────────────────────────────────────────────────────────

export function VariantDialog({
  productId,
  productName,
  onPick,
  onClose,
}: {
  productId: string;
  productName: string;
  onPick: (v: VariantPayload) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const { data } = useVariants({ productId, limit: 200 });
  const items = (data?.items ?? []).filter(
    (v) => v.isActive && v.label.toLowerCase().includes(filter.toLowerCase()),
  );
  const keys = useListKeys(items, onPick);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Which ${productName}?`}
      description="Type to narrow, ↑↓ to choose, Enter to add."
      size="md"
    >
      <Input
        data-autofocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={keys.onKeyDown}
        placeholder="e.g. -2.00"
        aria-label="Filter variants"
      />
      <ul role="listbox" className="mt-2 max-h-72 overflow-auto rounded-md border">
        {items.map((v, i) => (
          <li
            key={v.id}
            role="option"
            aria-selected={i === keys.active}
            onMouseEnter={() => keys.setActive(i)}
            onClick={() => onPick(v)}
            className={cn(
              'flex cursor-pointer justify-between px-3 py-2 text-sm',
              i === keys.active && 'bg-accent',
            )}
          >
            <span>{v.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">No variant matches.</li>
        )}
      </ul>
    </Dialog>
  );
}

// ─── Serials and lots ───────────────────────────────────────────────────────────────────

/**
 * Capture what a tracked line needs. Serials: scan them one after another — the count becomes the
 * quantity. Lot: pick from the lots in stock, soonest-expiring first, so the oldest stock sells first.
 */
export function TrackingDialog({
  line,
  onSerials,
  onLot,
  onClose,
}: {
  line: CartLine;
  onSerials: (serials: string[]) => void;
  onLot: (lotNo: string) => void;
  onClose: () => void;
}) {
  const [serials, setSerials] = useState<string[]>(line.serials);
  const [scan, setScan] = useState('');
  const lots = useLotsInStock(line.trackingMode === 'LOT' ? line.productId : null);
  const lotItems = (lots.data ?? []).filter((l) => l.totalOnHand > 0);
  const keys = useListKeys(lotItems, (l) => onLot(l.lotNo));

  if (line.trackingMode === 'LOT') {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`Lot for ${line.name}`}
        description="Soonest expiry first. ↑↓ to choose, Enter to use."
        size="md"
      >
        <div tabIndex={0} data-autofocus onKeyDown={keys.onKeyDown} className="outline-none">
          <ul role="listbox" className="max-h-72 overflow-auto rounded-md border">
            {lotItems.map((l, i) => (
              <li
                key={l.id}
                role="option"
                aria-selected={i === keys.active}
                onMouseEnter={() => keys.setActive(i)}
                onClick={() => onLot(l.lotNo)}
                className={cn(
                  'flex cursor-pointer justify-between gap-3 px-3 py-2 text-sm',
                  i === keys.active && 'bg-accent',
                )}
              >
                <span className="font-mono">{l.lotNo}</span>
                <span
                  className={cn(
                    'text-xs',
                    (l.daysToExpiry ?? 99) <= 30 ? 'text-warning' : 'text-muted-foreground',
                  )}
                >
                  {l.expiryDate ? `exp ${l.expiryDate}` : 'no expiry'}
                </span>
                <span className="tabular-nums">
                  {l.onHand.map((o) => `${o.locationCode} ${o.qtyOnHand}`).join(' · ')}
                </span>
              </li>
            ))}
            {!lots.isLoading && lotItems.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No lot of this product is in stock.
              </li>
            )}
          </ul>
        </div>
      </Dialog>
    );
  }

  const add = () => {
    const sn = scan.trim().toUpperCase();
    if (sn && !serials.includes(sn)) setSerials([...serials, sn]);
    setScan('');
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Serials for ${line.name}`}
      description="Scan each unit's serial. Enter on an empty box when done."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSerials(serials)} disabled={serials.length === 0}>
            Use {serials.length} serial(s)
          </Button>
        </>
      }
    >
      <Input
        data-autofocus
        value={scan}
        onChange={(e) => setScan(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (scan.trim()) add();
          else if (serials.length > 0) onSerials(serials);
        }}
        className="font-mono uppercase"
        placeholder="Scan serial…"
        aria-label="Serial number"
      />
      <ul className="mt-2 space-y-1">
        {serials.map((sn) => (
          <li
            key={sn}
            className="flex items-center justify-between rounded border px-3 py-1 font-mono text-sm"
          >
            {sn}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSerials(serials.filter((x) => x !== sn))}
              aria-label={`Remove ${sn}`}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {serials.length} scanned — the line's quantity becomes {serials.length || line.qty}. The
        server checks each is in stock here.
      </p>
    </Dialog>
  );
}

// ─── Park and resume ────────────────────────────────────────────────────────────────────

export function ParkDialog({
  onPark,
  onClose,
  pending,
}: {
  onPark: (label: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [label, setLabel] = useState('');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Park this sale"
      description="It is kept on the server for 24 hours, and survives a reload or a closed browser."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onPark(label.trim())} disabled={!label.trim() || pending}>
            Park
          </Button>
        </>
      }
    >
      <Input
        data-autofocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && label.trim() && onPark(label.trim())}
        placeholder="Man in blue shirt"
        aria-label="Name for the parked sale"
      />
    </Dialog>
  );
}

export function HeldDialog({
  onResume,
  onDiscard,
  onClose,
}: {
  onResume: (h: HeldSalePayload) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useHeldSales(true);
  const items = data ?? [];
  const keys = useListKeys(items, onResume);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Parked sales"
      description="↑↓ to choose · Enter to resume · Delete to discard"
      size="md"
    >
      <div
        tabIndex={0}
        data-autofocus
        className="outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Delete' && items[keys.active]) {
            e.preventDefault();
            onDiscard(items[keys.active]!.id);
          } else keys.onKeyDown(e);
        }}
      >
        <ul role="listbox" className="max-h-80 overflow-auto rounded-md border">
          {items.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === keys.active}
              onMouseEnter={() => keys.setActive(i)}
              onClick={() => onResume(h)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                i === keys.active && 'bg-accent',
              )}
            >
              <span className="font-medium">{h.label}</span>
              <span className="text-xs text-muted-foreground">
                {h.lines.length} line(s) · {new Date(h.createdAt).toLocaleTimeString()}
              </span>
            </li>
          ))}
          {!isLoading && items.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">Nothing parked.</li>
          )}
        </ul>
      </div>
    </Dialog>
  );
}

// ─── Done ───────────────────────────────────────────────────────────────────────────────

export function DoneDialog({ result, onNext }: { result: PosSaleResult; onNext: () => void }) {
  return (
    <Dialog
      open
      onClose={onNext}
      title={`Sale ${result.invoice.docNo}`}
      size="sm"
      footer={
        <>
          <ReceiptButtons sale={result} keys auto />
          <Button data-autofocus onClick={onNext}>
            New sale (Enter)
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-center" aria-live="assertive">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Total {money(result.invoice.grandTotalMinor)}
        </p>
        {result.changeMinor > 0 && (
          <p>
            <span className="block text-sm text-muted-foreground">Change</span>
            <span className="text-4xl font-semibold tabular-nums">
              {money(result.changeMinor)}
            </span>
          </p>
        )}
        {result.invoice.balanceMinor > 0 && (
          <p className="text-sm">
            On account: <strong>{money(result.invoice.balanceMinor)}</strong>
          </p>
        )}
      </div>
    </Dialog>
  );
}

// ─── Shortcuts ──────────────────────────────────────────────────────────────────────────

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Everything at the till works without a mouse."
      size="md"
    >
      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
            </dt>
            <dd className="text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

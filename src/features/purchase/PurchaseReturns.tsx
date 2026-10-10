import { Loader2, Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { DealerPicker } from '@/components/common/DealerPicker';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMap } from '@/features/inventory/docHelpers';
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { emptyLine, toLineInputs } from '@/features/inventory/stockLines';
import { StockLinesEditor } from '@/features/inventory/StockLinesEditor';
import { useCan } from '@/hooks/data/useAuth';
import {
  useCreatePurchaseReturn,
  useGrn,
  useGrns,
  usePurchaseReturns,
} from '@/hooks/data/usePurchasing';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { humanise } from '@/lib/utils';

import { minorFromInput, money, todayDay } from './purchaseFormat';

import { RETURN_REASONS } from '@shared/enums';

import type { Column } from '@/components/common/DataTable';
import type { LineDraft } from '@/features/inventory/stockLines';
import type { ReturnReason } from '@shared/enums';
import type { PurchaseReturnLineInput } from '@shared/purchasing';
import type { GoodsReceiptPayload, PartyPayload, PurchaseReturnPayload } from '@shared/types';

/**
 * Purchase returns (Day 34) — goods going back to the supplier. Posted as entered: the stock goes
 * out, what is left is re-costed, and the supplier's ledger is debited (our debit note, `DN-`).
 *
 * Against a receipt, each line goes back at what that receipt billed for it — no cost is typed —
 * and never more than came in on it. A direct return goes at the item's current cost.
 */
export function PurchaseReturns() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const grnId = params.get('grnId');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<'grn' | 'direct' | null>(grnId ? 'grn' : null);

  const { data, isLoading, isFetching } = usePurchaseReturns({ page, limit: 25 });

  const close = () => {
    setOpen(null);
    if (grnId) setParams({}, { replace: true });
  };

  const columns: Column<PurchaseReturnPayload>[] = [
    {
      key: 'docNo',
      header: 'Return',
      cell: (r) => (
        <div>
          <p className="font-mono text-sm">{r.docNo}</p>
          <p className="text-xs text-muted-foreground">{r.returnDate}</p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.supplierName}</p>
          <p className="truncate text-xs text-muted-foreground">from {r.locationName}</p>
        </div>
      ),
    },
    {
      key: 'grn',
      header: 'Against',
      cell: (r) =>
        r.grnId ? (
          <Link
            to={`/purchase/grn/${r.grnId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-sm text-primary underline"
          >
            {r.grnDocNo}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">direct</span>
        ),
    },
    {
      key: 'items',
      header: 'Items',
      cell: (r) => (
        <div className="space-y-0.5 text-sm">
          {r.lines.map((l) => (
            <p key={l.lineNo} className="truncate">
              {l.qty} {l.uomCode} {l.sku}
              {l.lotNo && <span className="text-muted-foreground"> · {l.lotNo}</span>}
              {l.serials.length > 0 && (
                <span className="font-mono text-xs text-muted-foreground">
                  {' '}
                  · {l.serials.join(', ')}
                </span>
              )}
            </p>
          ))}
        </div>
      ),
    },
    { key: 'reason', header: 'Reason', cell: (r) => humanise(r.reason) },
    {
      key: 'total',
      header: 'Debit note',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (r) => money(r.totalMinor),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase returns"
        icon={Undo2}
        description="Goods sent back to suppliers. Each one takes the stock out and debits the supplier."
        actions={
          can('grn:create') && (
            <>
              <Button variant="outline" onClick={() => setOpen('direct')}>
                Direct return
              </Button>
              <Button onClick={() => setOpen('grn')}>
                <Plus aria-hidden="true" />
                Return from a receipt
              </Button>
            </>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        empty={<EmptyState icon={Undo2} title="No purchase returns" />}
      />
      {open === 'grn' && <FromReceiptDialog initialGrnId={grnId} onClose={close} />}
      {open === 'direct' && <DirectDialog onClose={close} />}
    </div>
  );
}

// ─── Shared header ──────────────────────────────────────────────────────────────────────

interface Header {
  reason: ReturnReason;
  returnDate: string;
  note: string;
}

function HeaderFields({
  value,
  onChange,
  errors,
}: {
  value: Header;
  onChange: (patch: Partial<Header>) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field label="Reason" required error={errors.reason}>
        {(props) => (
          <Select
            {...props}
            value={value.reason}
            onChange={(e) => onChange({ reason: e.target.value as ReturnReason })}
          >
            {RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {humanise(r)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Date" error={errors.returnDate}>
        {(props) => (
          <Input
            {...props}
            type="date"
            value={value.returnDate}
            onChange={(e) => onChange({ returnDate: e.target.value })}
          />
        )}
      </Field>
      <Field label="Note" error={errors.note}>
        {(props) => (
          <Input
            {...props}
            value={value.note}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        )}
      </Field>
    </>
  );
}

const emptyHeader = (): Header => ({ reason: 'DAMAGED', returnDate: todayDay(), note: '' });

// ─── Against a receipt ──────────────────────────────────────────────────────────────────

function FromReceiptDialog({
  initialGrnId,
  onClose,
}: {
  initialGrnId: string | null;
  onClose: () => void;
}) {
  const [grnId, setGrnId] = useState(initialGrnId ?? '');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const grns = useGrns({ status: 'POSTED', limit: 20, q: q || undefined }, !grnId);
  const grn = useGrn(grnId || undefined);

  return (
    <Dialog
      open
      onClose={onClose}
      title={grn.data ? `Return from ${grn.data.docNo}` : 'Return from a receipt'}
      description={
        grn.data
          ? `${grn.data.supplierName} · received into ${grn.data.locationName}`
          : 'Which receipt did the goods come in on?'
      }
      size="xl"
      footer={
        !grnId && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {!grnId ? (
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Receipt or bill number…"
            aria-label="Search posted receipts"
            autoFocus
          />
          <ul className="max-h-80 space-y-1 overflow-auto">
            {(grns.data?.items ?? []).map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setGrnId(g.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>
                    <span className="font-mono">{g.docNo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {g.supplierName}
                      {g.supplierInvoiceNo ? ` · bill ${g.supplierInvoiceNo}` : ''}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(g.receivedAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
            {grns.data?.items.length === 0 && (
              <li className="px-2 py-3 text-sm text-muted-foreground">
                No posted receipts match.
              </li>
            )}
          </ul>
        </div>
      ) : !grn.data ? (
        <Skeleton className="h-48" />
      ) : (
        <ReceiptReturnForm grn={grn.data} onDone={onClose} />
      )}
    </Dialog>
  );
}

interface Pick {
  qty: string;
  serials: string[];
}

function ReceiptReturnForm({ grn, onDone }: { grn: GoodsReceiptPayload; onDone: () => void }) {
  const [header, setHeader] = useState<Header>(emptyHeader);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePurchaseReturn();
  const lines = grn.lines.filter((l) => l.qcStatus === 'OK' && l.qtyReturnedBase < l.qtyBase);
  const pick = (lineNo: number) => picks[lineNo] ?? { qty: '', serials: [] };
  const setPick = (lineNo: number, patch: Partial<Pick>) =>
    setPicks((p) => ({ ...p, [lineNo]: { ...pick(lineNo), ...patch } }));

  // What is sent, and — for the server's `lines.N` errors — which receipt line each entry is.
  const chosen = lines.flatMap((l) => {
    const p = pick(l.lineNo);
    const qty = l.serials.length > 0 ? p.serials.length : Number(p.qty);
    if (!qty) return [];
    const input: PurchaseReturnLineInput = {
      grnLineNo: l.lineNo,
      productId: l.productId,
      variantId: l.variantId,
      qty,
      ...(l.serials.length > 0 ? { serials: p.serials } : {}),
    };
    return [{ lineNo: l.lineNo, input }];
  });
  const errorFor = (lineNo: number) => {
    const i = chosen.findIndex((c) => c.lineNo === lineNo);
    if (i < 0) return undefined;
    return Object.entries(errors).find(([k]) => k.startsWith(`lines.${i}.`))?.[1];
  };

  const submit = () => {
    setErrors({});
    create.mutate(
      {
        grnId: grn.id,
        reason: header.reason,
        returnDate: header.returnDate || undefined,
        note: header.note.trim() || null,
        lines: chosen.map((c) => c.input),
      },
      { onSuccess: onDone, onError: (e) => setErrors(errorMap(e)) },
    );
  };

  if (lines.length === 0) {
    return <EmptyState icon={Undo2} title="Everything on this receipt has already gone back" />;
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <HeaderFields
          value={header}
          onChange={(p) => setHeader((h) => ({ ...h, ...p }))}
          errors={errors}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Can return</TableHead>
            <TableHead>Returning</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => {
            const left = l.qtyBase - l.qtyReturnedBase;
            const err = errorFor(l.lineNo);
            return (
              <TableRow key={l.lineNo}>
                <TableCell>
                  <p className="font-medium">{l.productName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {l.sku}
                    {l.variantLabel ? ` · ${l.variantLabel}` : ''}
                    {l.lotNo ? ` · lot ${l.lotNo}` : ''}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{left}</TableCell>
                <TableCell>
                  {l.serials.length > 0 ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {l.serials.map((sn) => (
                        <label key={sn} className="flex items-center gap-1.5 font-mono text-xs">
                          <Checkbox
                            checked={pick(l.lineNo).serials.includes(sn)}
                            onChange={(e) =>
                              setPick(l.lineNo, {
                                serials: e.target.checked
                                  ? [...pick(l.lineNo).serials, sn]
                                  : pick(l.lineNo).serials.filter((s) => s !== sn),
                              })
                            }
                          />
                          {sn}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      max={left}
                      value={pick(l.lineNo).qty}
                      onChange={(e) => setPick(l.lineNo, { qty: e.target.value })}
                      className="w-28 tabular-nums"
                      aria-label={`Quantity to return, ${l.sku}`}
                      placeholder="0"
                    />
                  )}
                  {err && <p className="mt-1 text-xs font-medium text-destructive">{err}</p>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {errors.lines && <p className="text-sm font-medium text-destructive">{errors.lines}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={create.isPending}>
          Close
        </Button>
        <Button onClick={submit} disabled={create.isPending || chosen.length === 0}>
          {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Post return
        </Button>
      </div>
    </div>
  );
}

// ─── Direct ─────────────────────────────────────────────────────────────────────────────

interface DirectLine extends LineDraft {
  unitCost: string;
}
const emptyDirectLine = (): DirectLine => ({ ...emptyLine(), unitCost: '' });

function DirectDialog({ onClose }: { onClose: () => void }) {
  const can = useCan();
  const seesCost = can('stock:viewCost');
  const [supplier, setSupplier] = useState<PartyPayload | null>(null);
  const [locationId, setLocationId] = useState('');
  const [header, setHeader] = useState<Header>(emptyHeader);
  const [lines, setLines] = useState<DirectLine[]>([emptyDirectLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePurchaseReturn();

  const submit = () => {
    setErrors({});
    const withProduct = lines.filter((l) => l.product);
    create.mutate(
      {
        supplierPartyId: supplier?.id,
        locationId: locationId || undefined,
        reason: header.reason,
        returnDate: header.returnDate || undefined,
        note: header.note.trim() || null,
        // Goods leaving need no lot dates — the lot already exists — and the schema refuses them.
        lines: toLineInputs(withProduct).map(
          ({ productId, variantId, uomCode, qty, ...l }, i) => {
            const unitCostMinor = seesCost
              ? minorFromInput(withProduct[i]!.unitCost)
              : undefined;
            return {
              productId,
              variantId,
              uomCode,
              qty,
              ...('lotNo' in l ? { lotNo: l.lotNo } : {}),
              ...('serials' in l ? { serials: l.serials } : {}),
              ...(unitCostMinor !== undefined ? { unitCostMinor } : {}),
            };
          },
        ),
      },
      { onSuccess: onClose, onError: (e) => setErrors(errorMap(e)) },
    );
  };

  return (
    <Dialog
      open
      onClose={create.isPending ? () => undefined : onClose}
      title="Direct return"
      description="Goods going back without a receipt to point at — valued at each item's current cost."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Close
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Post return
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Supplier"
            required
            error={errors.supplierPartyId}
            className="lg:col-span-2"
          >
            {({ id }) => (
              <DealerPicker id={id} role="SUPPLIER" value={supplier} onChange={setSupplier} />
            )}
          </Field>
          <Field label="From" required error={errors.locationId}>
            {() => (
              <LocationFilter
                value={locationId}
                onChange={setLocationId}
                includeAll={false}
                excludeTransit
                className="w-full"
              />
            )}
          </Field>
          <HeaderFields
            value={header}
            onChange={(p) => setHeader((h) => ({ ...h, ...p }))}
            errors={errors}
          />
        </div>
        <StockLinesEditor<DirectLine>
          lines={lines}
          onChange={setLines}
          signed={false}
          inboundLotDates={false}
          errors={errors}
          newLine={emptyDirectLine}
          renderExtra={(line, i, change) =>
            seesCost ? (
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.unitCost}
                onChange={(e) => change({ unitCost: e.target.value })}
                placeholder={`Credit per ${line.uomCode || 'unit'} — blank: current cost`}
                aria-label={`Credit per unit, line ${i + 1}`}
                aria-invalid={Boolean(errors[`lines.${i}.unitCostMinor`])}
                className="max-w-xs tabular-nums"
              />
            ) : null
          }
        />
      </div>
    </Dialog>
  );
}

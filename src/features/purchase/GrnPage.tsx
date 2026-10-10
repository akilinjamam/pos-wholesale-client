import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Cpu,
  Loader2,
  PackageCheck,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { DealerPicker } from '@/components/common/DealerPicker';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { StockLinesEditor } from '@/features/inventory/StockLinesEditor';
import { ReasonDialog } from '@/features/sales/ReasonDialog';
import { useCan } from '@/hooks/data/useAuth';
import {
  useCancelGrn,
  useCreateGrn,
  useGrn,
  usePostGrn,
  useUpdateGrn,
} from '@/hooks/data/usePurchasing';
import { cn } from '@/lib/utils';

import {
  emptyGrn,
  emptyGrnLine,
  fromGrn,
  fromPoForReceipt,
  localDay,
  toGrnInput,
} from './grnDraft';
import { GRN_TONE, money } from './purchaseFormat';

import type { GrnDraft, GrnLineDraft } from './grnDraft';
import type { GoodsReceiptPayload } from '@shared/types';

/**
 * `/purchase/grn/new` (`?poId=` to receive against a PO) — a receipt being entered.
 */
export function NewGrnPage() {
  const activeLocationId = useAppSelector((s) => s.ui.activeLocationId);
  const [params] = useSearchParams();
  const poId = params.get('poId');
  const initial = useQuery({
    queryKey: ['purchasing', 'grn-builder', 'new', poId],
    queryFn: () =>
      poId
        ? fromPoForReceipt(poId, activeLocationId)
        : Promise.resolve(emptyGrn(activeLocationId)),
    staleTime: Infinity,
    gcTime: 0,
  });
  if (initial.isError)
    return <EmptyState icon={PackageCheck} title="That PO cannot be loaded" />;
  if (!initial.data) return <Skeleton className="h-96" />;
  return <GrnEditor grn={null} initial={initial.data} />;
}

/** `/purchase/grn/:id` — a draft opens in the editor; a posted receipt read-only. */
export function GrnPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const grn = useGrn(id);
  // A new receipt saved and then refused at posting arrives here with the refusal's field errors.
  const carried = (useLocation().state as { errors?: Record<string, string> } | null)?.errors;
  const editable = grn.data?.status === 'DRAFT' && can('grn:create');
  const initial = useQuery({
    queryKey: ['purchasing', 'grn-builder', id],
    queryFn: () => fromGrn(grn.data!),
    enabled: editable,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (grn.isLoading) return <Skeleton className="h-96" />;
  if (!grn.data) return <EmptyState icon={PackageCheck} title="No such goods receipt" />;
  if (editable) {
    return initial.data ? (
      <GrnEditor grn={grn.data} initial={initial.data} initialErrors={carried} />
    ) : (
      <Skeleton className="h-96" />
    );
  }
  return <GrnView grn={grn.data} />;
}

// ─── Editor ─────────────────────────────────────────────────────────────────────────────

/**
 * What arrived, line by line. Each row asks for what its product needs: a lot and its expiry for
 * lot goods (solutions), one serial per unit for serialised ones (machines). A draft may be saved
 * without them — the boxes are still being opened — and posting asks for every one still missing,
 * all at once, on the row it belongs to.
 */
function GrnEditor({
  grn,
  initial,
  initialErrors,
}: {
  grn: GoodsReceiptPayload | null;
  initial: GrnDraft;
  initialErrors?: Record<string, string>;
}) {
  const navigate = useNavigate();
  const can = useCan();
  const seesCost = can('stock:viewCost');
  const [d, setD] = useState<GrnDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>(initialErrors ?? {});
  const [cancelling, setCancelling] = useState(false);
  const set = (patch: Partial<GrnDraft>) => setD((x) => ({ ...x, ...patch }));
  const originalDay = grn ? localDay(grn.receivedAt) : null;

  const create = useCreateGrn();
  const update = useUpdateGrn();
  const post = usePostGrn();
  const cancel = useCancelGrn();
  const pending = create.isPending || update.isPending || post.isPending || cancel.isPending;

  /**
   * A new receipt moves to its own URL once saved — but only after posting has been tried, or a
   * refusal's field errors would land on this editor as it unmounts. They travel with the move.
   */
  const save = async (moveWhenCreated = true): Promise<string | undefined> => {
    setErrors({});
    const { poId: _poId, ...rest } = toGrnInput(d, seesCost, originalDay);
    try {
      if (grn) return (await update.mutateAsync({ id: grn.id, body: rest })).id;
      const created = await create.mutateAsync({ poId: d.po?.id ?? null, ...rest });
      if (moveWhenCreated) navigate(`/purchase/grn/${created.id}`, { replace: true });
      return created.id;
    } catch (e) {
      setErrors(errorMap(e));
      return undefined;
    }
  };

  const saveAndPost = async () => {
    const id = await save(false);
    if (!id) return;
    try {
      await post.mutateAsync(id);
      if (!grn) navigate(`/purchase/grn/${id}`, { replace: true });
    } catch (e) {
      if (grn) setErrors(errorMap(e));
      else navigate(`/purchase/grn/${id}`, { replace: true, state: { errors: errorMap(e) } });
    }
  };

  const supplierName = d.po?.supplierName ?? d.supplier?.name;

  return (
    <div className="space-y-5">
      <PageHeader
        title={grn ? 'Draft goods receipt' : 'Receive goods'}
        icon={PackageCheck}
        description={
          d.po
            ? `Against ${d.po.docNo} from ${supplierName} — into ${d.po.locationName}.`
            : 'A direct receipt, with no purchase order behind it.'
        }
        actions={
          <Button variant="ghost" onClick={() => navigate('/purchase/grn')}>
            <ArrowLeft aria-hidden="true" />
            All receipts
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {!d.po && (
            <>
              <Field
                label="Supplier"
                required
                error={errors.supplierPartyId}
                className="sm:col-span-2"
              >
                {({ id }) => (
                  <DealerPicker
                    id={id}
                    role="SUPPLIER"
                    value={d.supplier}
                    onChange={(supplier) => set({ supplier })}
                  />
                )}
              </Field>
              <Field label="Into" required error={errors.locationId}>
                {() => (
                  <LocationFilter
                    value={d.locationId}
                    onChange={(locationId) => set({ locationId })}
                    includeAll={false}
                    excludeTransit
                    className="w-full"
                  />
                )}
              </Field>
            </>
          )}
          <Field label="Received on" error={errors.receivedAt}>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={d.receivedDate}
                onChange={(e) => set({ receivedDate: e.target.value })}
              />
            )}
          </Field>
          <Field
            label="Supplier's bill no."
            error={errors.supplierInvoiceNo}
            hint="Each bill can be posted once."
          >
            {(props) => (
              <Input
                {...props}
                value={d.supplierInvoiceNo}
                onChange={(e) => set({ supplierInvoiceNo: e.target.value })}
                className="font-mono uppercase"
              />
            )}
          </Field>
          <Field
            label="Bill date"
            error={errors.supplierInvoiceDate}
            hint="Payment is due from here."
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                value={d.supplierInvoiceDate}
                onChange={(e) => set({ supplierInvoiceDate: e.target.value })}
              />
            )}
          </Field>
          {seesCost && (
            <Field
              label="Freight & other charges"
              error={errors.otherChargesMinor}
              hint="Spread over the lines by value, into their cost."
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  step="0.01"
                  value={d.otherCharges}
                  onChange={(e) => set({ otherCharges: e.target.value })}
                />
              )}
            </Field>
          )}
          <Field label="Note" error={errors.note} className="sm:col-span-2">
            {(props) => (
              <Input
                {...props}
                value={d.note}
                onChange={(e) => set({ note: e.target.value })}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What arrived</CardTitle>
          <p className="text-sm text-muted-foreground">
            Name the lot and its expiry on lot goods, and scan one serial per unit on machines.
            Mark a line damaged to refuse it at the door — it is recorded, not stocked or owed.
          </p>
        </CardHeader>
        <CardContent>
          <StockLinesEditor<GrnLineDraft>
            lines={d.lines}
            onChange={(lines) => set({ lines })}
            signed={false}
            inboundLotDates
            errors={errors}
            newLine={emptyGrnLine}
            isLocked={(l) => Boolean(l.poLineId)}
            canAddLines={!d.po}
            renderExtra={(line, i, change) => (
              <GrnLineExtras
                line={line}
                index={i}
                change={change}
                seesCost={seesCost}
                errors={errors}
              />
            )}
          />
          {d.po && (
            <p className="mt-3 text-xs text-muted-foreground">
              Lines come from {d.po.docNo}, at what is still to come. Short today? Lower the
              quantity, or remove a line with the bin — the rest stays open for the next
              delivery.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {grn && can('grn:cancel') && (
          <Button
            variant="ghost"
            className="mr-auto text-destructive"
            disabled={pending}
            onClick={() => setCancelling(true)}
          >
            <XCircle aria-hidden="true" />
            Cancel draft
          </Button>
        )}
        <Button variant="outline" disabled={pending} onClick={() => void save()}>
          Save draft
        </Button>
        <Button disabled={pending} onClick={() => void saveAndPost()}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <PackageCheck aria-hidden="true" />
          )}
          Save & post
        </Button>
      </div>

      {cancelling && grn && (
        <ReasonDialog
          title="Cancel this draft receipt?"
          description="It stays on record as cancelled. Nothing was stocked, so nothing is reversed."
          confirmLabel="Cancel draft"
          optional
          destructive
          pending={cancel.isPending}
          onClose={() => setCancelling(false)}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: grn.id, body: reason ? { reason } : {} },
              { onSuccess: () => navigate('/purchase/grn') },
            )
          }
        />
      )}
    </div>
  );
}

function GrnLineExtras({
  line,
  index,
  change,
  seesCost,
  errors,
}: {
  line: GrnLineDraft;
  index: number;
  change: (patch: Partial<GrnLineDraft>) => void;
  seesCost: boolean;
  errors: Record<string, string>;
}) {
  const err = (f: string) => errors[`lines.${index}.${f}`];
  const message = err('poLineId') ?? err('unitCostMinor');
  return (
    <div className="space-y-1">
      <div className="grid gap-3 sm:grid-cols-[10rem_7rem_9rem_1fr]">
        {seesCost ? (
          <Input
            type="number"
            min={0}
            step="0.01"
            value={line.unitCost}
            onChange={(e) => change({ unitCost: e.target.value })}
            placeholder={line.poLineId ? 'PO price' : 'Current cost'}
            aria-label={`Unit cost, line ${index + 1}`}
            aria-invalid={Boolean(err('unitCostMinor'))}
            className="tabular-nums"
          />
        ) : (
          <p className="flex h-10 items-center text-xs text-muted-foreground">
            {line.poLineId ? 'At the PO price' : 'At the current cost'}
          </p>
        )}
        <Input
          type="number"
          min={0}
          max={100}
          value={line.discountPct}
          onChange={(e) => change({ discountPct: e.target.value })}
          placeholder="Disc %"
          aria-label={`Discount %, line ${index + 1}`}
          className="tabular-nums"
        />
        <Select
          value={line.qcStatus}
          onChange={(e) => change({ qcStatus: e.target.value as GrnLineDraft['qcStatus'] })}
          aria-label={`Condition, line ${index + 1}`}
          className={cn(line.qcStatus === 'DAMAGED' && 'text-destructive')}
        >
          <option value="OK">Accepted</option>
          <option value="DAMAGED">Damaged — refused</option>
        </Select>
        <p className="flex h-10 items-center justify-end text-xs text-muted-foreground">
          {line.outstandingBase !== null &&
            `${line.outstandingBase} ${line.product?.baseUom ?? ''} still to come on the PO`}
        </p>
      </div>
      {message && <p className="text-xs font-medium text-destructive">{message}</p>}
    </div>
  );
}

// ─── Posted view ────────────────────────────────────────────────────────────────────────

function GrnView({ grn }: { grn: GoodsReceiptPayload }) {
  const navigate = useNavigate();
  const can = useCan();
  const posted = grn.status === 'POSTED';
  const hasSerials = grn.lines.some((l) => l.serials.length > 0);
  const hasLots = grn.lines.some((l) => l.lotNo);
  const returnable = grn.lines.some(
    (l) => l.qcStatus === 'OK' && l.qtyReturnedBase < l.qtyBase,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={grn.docNo ?? 'Goods receipt'}
        icon={PackageCheck}
        description={`${grn.supplierName} · into ${grn.locationName} · ${new Date(
          grn.receivedAt,
        ).toLocaleString()}${grn.poDocNo ? ` · against ${grn.poDocNo}` : ' · direct'}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/purchase/grn')}>
              <ArrowLeft aria-hidden="true" />
              All receipts
            </Button>
            {posted && (
              <Button
                variant="outline"
                onClick={() =>
                  navigate(`/inventory/ledger?refDocNo=${encodeURIComponent(grn.docNo!)}`)
                }
              >
                <BookOpen aria-hidden="true" />
                Ledger rows
              </Button>
            )}
            {posted && hasSerials && (
              <Button variant="outline" onClick={() => navigate('/inventory/serials')}>
                <Cpu aria-hidden="true" />
                Serial register
              </Button>
            )}
            {posted && hasLots && (
              <Button
                variant="outline"
                onClick={() => navigate('/inventory/expiry?within=3650')}
              >
                <CalendarClock aria-hidden="true" />
                Lots & expiry
              </Button>
            )}
            {posted && returnable && can('grn:create') && (
              <Button onClick={() => navigate(`/purchase/returns?grnId=${grn.id}`)}>
                <Undo2 aria-hidden="true" />
                Return goods
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Lot / serials</TableHead>
                  {!grn.costHidden && (
                    <TableHead className="text-right">Landed / unit</TableHead>
                  )}
                  {!grn.costHidden && <TableHead className="text-right">Bill value</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grn.lines.map((l) => (
                  <TableRow
                    key={l.lineNo}
                    className={cn(l.qcStatus === 'DAMAGED' && 'opacity-70')}
                  >
                    <TableCell>
                      <p className="font-medium">{l.productName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {l.sku}
                        {l.variantLabel ? ` · ${l.variantLabel}` : ''}
                      </p>
                      {l.qcStatus === 'DAMAGED' && (
                        <StatusPill status="DAMAGED" tone="danger" label="Damaged — refused" />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.qty} {l.uomCode}
                      {l.qtyReturnedBase > 0 && (
                        <span className="block text-xs text-warning">
                          {l.qtyReturnedBase} returned
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.lotNo && (
                        <p>
                          <span className="font-mono">{l.lotNo}</span>
                          {l.expiryDate && (
                            <span className="text-muted-foreground"> · exp {l.expiryDate}</span>
                          )}
                        </p>
                      )}
                      {l.serials.length > 0 && (
                        <p className="font-mono text-xs">{l.serials.join(', ')}</p>
                      )}
                    </TableCell>
                    {!grn.costHidden && (
                      <TableCell className="text-right tabular-nums">
                        {money(l.landedUnitCostMinor)}
                      </TableCell>
                    )}
                    {!grn.costHidden && (
                      <TableCell className="text-right tabular-nums">
                        {money(l.lineTotalMinor)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusPill status={grn.status} tone={GRN_TONE[grn.status]} />
            </div>
            {grn.supplierInvoiceNo && (
              <Row
                label="Supplier's bill"
                value={`${grn.supplierInvoiceNo}${grn.supplierInvoiceDate ? ` · ${grn.supplierInvoiceDate}` : ''}`}
              />
            )}
            {grn.poId && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Purchase order</span>
                <Link
                  to={`/purchase/orders/${grn.poId}`}
                  className="font-mono text-primary underline"
                >
                  {grn.poDocNo}
                </Link>
              </div>
            )}
            {!grn.costHidden && (
              <>
                <Row
                  label="Goods"
                  value={money((grn.subtotalMinor ?? 0) - (grn.discountMinor ?? 0))}
                />
                {Boolean(grn.otherChargesMinor) && (
                  <Row label="Other charges" value={money(grn.otherChargesMinor)} />
                )}
                <Row label="Bill total" value={money(grn.grandTotalMinor)} strong />
                {posted && <Row label="Owed" value={money(grn.balanceMinor)} />}
              </>
            )}
            {grn.dueDate && <Row label="Due" value={grn.dueDate.slice(0, 10)} />}
            {grn.cancelReason && <Row label="Why cancelled" value={grn.cancelReason} />}
            {grn.note && <p className="text-muted-foreground">{grn.note}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  );
}

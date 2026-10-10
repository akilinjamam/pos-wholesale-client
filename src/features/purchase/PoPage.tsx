import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackageCheck,
  Send,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { DealerPicker } from '@/components/common/DealerPicker';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { ProgressBar } from '@/features/sales/ProgressBar';
import { ReasonDialog } from '@/features/sales/ReasonDialog';
import { useCan } from '@/hooks/data/useAuth';
import {
  useApprovePo,
  useCancelPo,
  useCreatePo,
  useGrns,
  usePo,
  useReopenPo,
  useSendPo,
  useShortClosePo,
  useUpdatePo,
} from '@/hooks/data/usePurchasing';
import { humanise } from '@/lib/utils';

import { emptyPo, emptyPoLine, fromPo, fromSeed, toPoInput } from './poDraft';
import { GRN_TONE, minorFromInput, money, PO_TONE } from './purchaseFormat';

import type { PoDraft, PoLineDraft, PoSeed } from './poDraft';
import type { PurchaseOrderPayload } from '@shared/types';

/**
 * `/purchase/orders/new` — an empty builder, or one seeded by the reorder screen (router state).
 */
export function NewPoPage() {
  const activeLocationId = useAppSelector((s) => s.ui.activeLocationId);
  const seed = (useLocation().state as { seed?: PoSeed } | null)?.seed;
  const initial = useQuery({
    queryKey: ['purchasing', 'builder', 'new', seed],
    queryFn: () =>
      seed ? fromSeed(seed, activeLocationId) : Promise.resolve(emptyPo(activeLocationId)),
    staleTime: Infinity,
    gcTime: 0,
  });
  if (!initial.data) return <Skeleton className="h-96" />;
  return <PoBuilder po={null} initial={initial.data} />;
}

/**
 * `/purchase/orders/:id` — a draft the caller may edit opens in the builder; anything else opens
 * read-only, with the lifecycle buttons the server says this caller may press.
 */
export function PoPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const po = usePo(id);
  const carried = (useLocation().state as { errors?: Record<string, string> } | null)?.errors;
  const editable = po.data?.status === 'DRAFT' && can('po:update');
  const initial = useQuery({
    queryKey: ['purchasing', 'builder', id],
    queryFn: () => fromPo(po.data!),
    enabled: editable,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (po.isLoading) return <Skeleton className="h-96" />;
  if (!po.data) return <EmptyState icon={ClipboardList} title="No such purchase order" />;
  if (editable) {
    return initial.data ? (
      <PoBuilder po={po.data} initial={initial.data} initialErrors={carried} />
    ) : (
      <Skeleton className="h-96" />
    );
  }
  return <PoView po={po.data} />;
}

// ─── Builder ────────────────────────────────────────────────────────────────────────────

function PoBuilder({
  po,
  initial,
  initialErrors,
}: {
  po: PurchaseOrderPayload | null;
  initial: PoDraft;
  initialErrors?: Record<string, string>;
}) {
  const navigate = useNavigate();
  const can = useCan();
  const seesCost = can('stock:viewCost');
  const [d, setD] = useState<PoDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>(initialErrors ?? {});
  const [cancelling, setCancelling] = useState(false);
  const set = (patch: Partial<PoDraft>) => setD((x) => ({ ...x, ...patch }));

  const create = useCreatePo();
  const update = useUpdatePo();
  const approve = useApprovePo();
  const cancel = useCancelPo();
  const pending = create.isPending || update.isPending || approve.isPending || cancel.isPending;

  /** As on the receipt screen: a new PO moves to its URL after approval is tried, with any refusal. */
  const save = async (moveWhenCreated = true): Promise<string | undefined> => {
    setErrors({});
    const body = toPoInput(d, seesCost);
    try {
      if (po) return (await update.mutateAsync({ id: po.id, body })).id;
      const created = await create.mutateAsync(body);
      if (moveWhenCreated) navigate(`/purchase/orders/${created.id}`, { replace: true });
      return created.id;
    } catch (e) {
      setErrors(errorMap(e));
      return undefined;
    }
  };

  const saveAndApprove = async () => {
    const id = await save(false);
    if (!id) return;
    try {
      await approve.mutateAsync(id);
      if (!po) navigate(`/purchase/orders/${id}`, { replace: true });
    } catch (e) {
      if (po) setErrors(errorMap(e));
      else
        navigate(`/purchase/orders/${id}`, { replace: true, state: { errors: errorMap(e) } });
    }
  };

  // A preview only — the server recomputes every figure on save.
  const lineNet = (l: PoLineDraft) => {
    const cost = minorFromInput(l.unitCost);
    if (cost === undefined || !Number(l.qty)) return null;
    const gross = cost * Number(l.qty);
    return gross - Math.round((gross * (Number(l.discountPct) || 0)) / 100);
  };
  const typed = d.lines.map(lineNet);
  const preview =
    typed.every((n) => n !== null) && typed.length > 0
      ? typed.reduce((a, b) => a! + b!, 0)! + (minorFromInput(d.shipping) ?? 0)
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={po ? 'Draft purchase order' : 'New purchase order'}
        icon={ClipboardList}
        description="Saved as a draft; approving gives it a number and makes it something goods can be received against."
        actions={
          <Button variant="ghost" onClick={() => navigate('/purchase/orders')}>
            <ArrowLeft aria-hidden="true" />
            All POs
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
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
                onChange={(supplier) =>
                  set({
                    supplier,
                    paymentTermsDays: supplier?.supplier
                      ? String(supplier.supplier.paymentTermsDays)
                      : d.paymentTermsDays,
                  })
                }
              />
            )}
          </Field>
          <Field label="Deliver to" required error={errors.locationId}>
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
          <Field
            label="Supplier's ref"
            error={errors.supplierRef}
            hint="Quotation or proforma no."
          >
            {(props) => (
              <Input
                {...props}
                value={d.supplierRef}
                onChange={(e) => set({ supplierRef: e.target.value })}
              />
            )}
          </Field>
          <Field label="Order date" error={errors.orderDate}>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={d.orderDate}
                onChange={(e) => set({ orderDate: e.target.value })}
              />
            )}
          </Field>
          <Field
            label="Expected"
            error={errors.expectedDate}
            hint="Blank: order date + the supplier's lead time."
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                value={d.expectedDate}
                onChange={(e) => set({ expectedDate: e.target.value })}
              />
            )}
          </Field>
          <Field label="Payment terms (days)" error={errors.paymentTermsDays}>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                value={d.paymentTermsDays}
                onChange={(e) => set({ paymentTermsDays: e.target.value })}
                placeholder="Supplier's terms"
              />
            )}
          </Field>
          {seesCost && (
            <Field label="Freight" error={errors.shippingMinor} hint="Charged by the supplier.">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  step="0.01"
                  value={d.shipping}
                  onChange={(e) => set({ shipping: e.target.value })}
                />
              )}
            </Field>
          )}
          <Field label="Note" error={errors.note} className="sm:col-span-2 lg:col-span-4">
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
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <StockLinesEditor<PoLineDraft>
            lines={d.lines}
            onChange={(lines) => set({ lines })}
            signed={false}
            inboundLotDates={false}
            capture={false}
            errors={errors}
            newLine={emptyPoLine}
            renderExtra={(line, i, change) => (
              <div className="grid gap-3 sm:grid-cols-[10rem_7rem_1fr]">
                {seesCost ? (
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unitCost}
                    onChange={(e) => change({ unitCost: e.target.value })}
                    placeholder={`Cost / ${line.uomCode || 'unit'} (auto)`}
                    aria-label={`Unit cost, line ${i + 1}`}
                    aria-invalid={Boolean(errors[`lines.${i}.unitCostMinor`])}
                    className="tabular-nums"
                  />
                ) : (
                  <p className="flex h-10 items-center text-xs text-muted-foreground">
                    Cost from the item
                  </p>
                )}
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={line.discountPct}
                  onChange={(e) => change({ discountPct: e.target.value })}
                  placeholder="Disc %"
                  aria-label={`Discount %, line ${i + 1}`}
                  className="tabular-nums"
                />
                <p className="flex h-10 items-center justify-end text-sm tabular-nums text-muted-foreground">
                  {errors[`lines.${i}.unitCostMinor`] ??
                    (lineNet(line) !== null ? money(lineNet(line)) : '')}
                </p>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {seesCost && (
          <p className="mr-auto text-sm text-muted-foreground">
            {preview !== null
              ? `About ${money(preview)} — the server works out the exact total on save.`
              : 'Blank costs are filled from each item’s current cost on save.'}
          </p>
        )}
        {po && can('po:cancel') && (
          <Button
            variant="ghost"
            className="text-destructive"
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
        {can('po:approve') && (
          <Button disabled={pending} onClick={() => void saveAndApprove()}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            Save & approve
          </Button>
        )}
      </div>

      {cancelling && po && (
        <ReasonDialog
          title="Cancel this draft?"
          description="Nobody has committed to a draft, so no reason is required."
          confirmLabel="Cancel draft"
          optional
          destructive
          pending={cancel.isPending}
          onClose={() => setCancelling(false)}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: po.id, body: reason ? { reason } : {} },
              { onSuccess: () => setCancelling(false) },
            )
          }
        />
      )}
    </div>
  );
}

// ─── Read-only view ─────────────────────────────────────────────────────────────────────

const ACTION_UI: Record<
  string,
  { label: string; icon: typeof Send; destructive?: boolean; describe: string }
> = {
  approve: { label: 'Approve', icon: CheckCircle2, describe: '' },
  send: { label: 'Mark as sent', icon: Send, describe: '' },
  reopen: {
    label: 'Reopen to edit',
    icon: Undo2,
    describe: 'It goes back to draft and needs approving again. Why is it changing?',
  },
  cancel: {
    label: 'Cancel PO',
    icon: XCircle,
    destructive: true,
    describe: 'The supplier may already be packing. Say why it is cancelled.',
  },
  shortClose: {
    label: 'Short close',
    icon: XCircle,
    destructive: true,
    describe: 'What is still to come is cancelled line by line. Say why it is not coming.',
  },
};

function PoView({ po }: { po: PurchaseOrderPayload }) {
  const navigate = useNavigate();
  const can = useCan();
  const [asking, setAsking] = useState<string | null>(null);
  const approve = useApprovePo();
  const send = useSendPo();
  const reopen = useReopenPo();
  const cancel = useCancelPo();
  const shortClose = useShortClosePo();
  const pending =
    approve.isPending ||
    send.isPending ||
    reopen.isPending ||
    cancel.isPending ||
    shortClose.isPending;
  const grns = useGrns({ poId: po.id, limit: 50 });
  const receivable = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status);

  const run = (action: string, reason?: string) => {
    const done = { onSuccess: () => setAsking(null) };
    const body = { reason: reason ?? '' };
    if (action === 'approve') approve.mutate(po.id, done);
    else if (action === 'send') send.mutate(po.id, done);
    else if (action === 'reopen') reopen.mutate({ id: po.id, body }, done);
    else if (action === 'cancel') cancel.mutate({ id: po.id, body }, done);
    else if (action === 'shortClose') shortClose.mutate({ id: po.id, body }, done);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={po.docNo ?? 'Draft purchase order'}
        icon={ClipboardList}
        description={`${po.supplierName} · to ${po.locationName} · ordered ${po.orderDate.slice(0, 10)}${
          po.expectedDate ? ` · expected ${po.expectedDate.slice(0, 10)}` : ''
        }`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/purchase/orders')}>
              <ArrowLeft aria-hidden="true" />
              All POs
            </Button>
            {po.availableActions.map(({ action, requiresReason }) => {
              const ui = ACTION_UI[action];
              if (!ui) return null;
              const Icon = ui.icon;
              return (
                <Button
                  key={action}
                  variant={ui.destructive ? 'outline' : 'secondary'}
                  className={ui.destructive ? 'text-destructive' : undefined}
                  disabled={pending}
                  onClick={() => (requiresReason ? setAsking(action) : run(action))}
                >
                  <Icon aria-hidden="true" />
                  {ui.label}
                </Button>
              );
            })}
            {receivable && can('grn:create') && (
              <Button onClick={() => navigate(`/purchase/grn/new?poId=${po.id}`)}>
                <PackageCheck aria-hidden="true" />
                Receive goods
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
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">To come</TableHead>
                  {!po.costHidden && <TableHead className="text-right">Cost</TableHead>}
                  {!po.costHidden && <TableHead className="text-right">Total</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <p className="font-medium">{l.productName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {l.sku}
                        {l.variantLabel ? ` · ${l.variantLabel}` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.uomQty} {l.uomCode}
                      {l.uomQty !== l.qtyBase && (
                        <span className="block text-xs text-muted-foreground">
                          {l.qtyBase} base
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.qtyReceivedBase}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.qtyOutstandingBase}
                      {l.qtyCancelledBase > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {l.qtyCancelledBase} cancelled
                        </span>
                      )}
                    </TableCell>
                    {!po.costHidden && (
                      <TableCell className="text-right tabular-nums">
                        {money(l.unitCostMinor)}
                        {l.discountPct > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            −{l.discountPct}%
                          </span>
                        )}
                      </TableCell>
                    )}
                    {!po.costHidden && (
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

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusPill status={po.status} tone={PO_TONE[po.status]} />
              </div>
              <ProgressBar label="Received" value={po.receivedRatio} />
              {!po.costHidden && (
                <>
                  <Row label="Subtotal" value={money(po.subtotalMinor)} />
                  {Boolean(po.discountMinor) && (
                    <Row label="Discount" value={`−${money(po.discountMinor)}`} />
                  )}
                  {Boolean(po.shippingMinor) && (
                    <Row label="Freight" value={money(po.shippingMinor)} />
                  )}
                  <Row label="Total" value={money(po.grandTotalMinor)} strong />
                </>
              )}
              <Row label="Terms" value={`${po.paymentTermsDays} days`} />
              {po.supplierRef && <Row label="Supplier's ref" value={po.supplierRef} />}
              {po.cancelReason && <Row label="Why" value={po.cancelReason} />}
              {po.note && <p className="text-muted-foreground">{po.note}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Goods receipts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(grns.data?.items ?? []).length === 0 ? (
                <p className="text-muted-foreground">Nothing received yet.</p>
              ) : (
                grns.data!.items.map((g) => (
                  <Link
                    key={g.id}
                    to={`/purchase/grn/${g.id}`}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="font-mono">{g.docNo ?? 'Draft'}</span>
                    <span className="text-xs text-muted-foreground">
                      {g.receivedAt.slice(0, 10)}
                    </span>
                    <StatusPill status={g.status} tone={GRN_TONE[g.status]} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {po.statusHistory.map((h, i) => (
                  <li key={i}>
                    <p>
                      <span className="font-medium">{humanise(h.action)}</span>{' '}
                      <span className="text-muted-foreground">→ {humanise(h.to)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(h.at).toLocaleString()}
                      {h.reason ? ` — ${h.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {asking && ACTION_UI[asking] && (
        <ReasonDialog
          title={`${ACTION_UI[asking].label}?`}
          description={ACTION_UI[asking].describe}
          confirmLabel={ACTION_UI[asking].label}
          destructive={ACTION_UI[asking].destructive}
          pending={pending}
          onClose={() => setAsking(null)}
          onConfirm={(reason) => run(asking, reason)}
        />
      )}
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

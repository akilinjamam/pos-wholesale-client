import {
  Archive,
  Ban,
  CheckCircle2,
  ClipboardList,
  History,
  PackageSearch,
  Scissors,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money } from '@/features/dealers/creditMath';
import { useCan } from '@/hooks/data/useAuth';
import { useCreateDispatch } from '@/hooks/data/useDispatches';
import {
  useApproveOrder,
  useCancelOrder,
  useCloseOrder,
  useRejectOrder,
  useShortCloseOrder,
} from '@/hooks/data/useOrders';
import { humanise } from '@/lib/utils';

import { OrderChallans } from './OrderChallans';
import { orderProgress } from './orderProgress';
import { ProgressBar } from './ProgressBar';
import { ReasonDialog } from './ReasonDialog';

import type { WholesaleOrderPayload } from '@shared/types';

/**
 * An order past draft, read-only: what was confirmed, what is reserved, and how it got here.
 *
 * Every figure is the stored one — a confirmed order's prices do not move when a price list does.
 * The action buttons are the server's `availableActions` for this user, so a button is never shown
 * that the state machine would refuse. Picking starts a challan (Day 25); short close and close
 * finish an order (Day 26).
 */

type Act = 'approve' | 'reject' | 'cancel' | 'shortClose' | 'close';

const ACTS: Record<
  Act,
  { label: string; title: string; description: string; destructive?: boolean }
> = {
  approve: {
    label: 'Approve',
    title: 'Approve over the credit limit?',
    description:
      'The order is confirmed and its stock reserved. Your reason is recorded as the credit override.',
  },
  reject: {
    label: 'Send back',
    title: 'Send back to the sales rep?',
    description: 'The order returns to draft for them to amend. Say what needs to change.',
  },
  cancel: {
    label: 'Cancel order',
    title: 'Cancel this order?',
    description: 'Every unit reserved for it is released back to available stock.',
    destructive: true,
  },
  shortClose: {
    label: 'Short close',
    title: 'Short-close this order?',
    // Replaced with the exact quantities when the dialog opens — see `shortCloseText`.
    description: '',
    destructive: true,
  },
  close: {
    label: 'Close order',
    title: 'Close this order?',
    description: 'Everything was delivered. The order becomes a closed record.',
  },
};

const ICON: Record<Act, typeof Ban> = {
  approve: CheckCircle2,
  reject: Undo2,
  cancel: Ban,
  shortClose: Scissors,
  close: Archive,
};

/** What a short close will do to this order, in its own numbers. */
function shortCloseText(order: WholesaleOrderPayload): string {
  const p = orderProgress(order);
  const left = p.toShipBase - p.dispatchedBase;
  return (
    `${p.dispatchedBase} of ${p.toShipBase} units have shipped. The other ${left} are cancelled for good` +
    (p.reservedBase
      ? `, the ${p.reservedBase} reserved for them go back to available stock`
      : '') +
    ', and any challan still being picked or packed is cancelled. What shipped stays invoiced.'
  );
}

export function OrderView({ order }: { order: WholesaleOrderPayload }) {
  const [acting, setActing] = useState<Act | null>(null);
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const cancel = useCancelOrder();
  const shortClose = useShortCloseOrder();
  const close = useCloseOrder();
  const pending =
    approve.isPending ||
    reject.isPending ||
    cancel.isPending ||
    shortClose.isPending ||
    close.isPending;
  const progress = orderProgress(order);
  const can = useCan();
  const navigate = useNavigate();
  const startPick = useCreateDispatch();
  // Picking starts a challan; the order follows (CONFIRMED → PICKING) on the server.
  const canPick =
    can('dispatch:create') &&
    ['CONFIRMED', 'PICKING', 'PACKED', 'PARTIALLY_DISPATCHED'].includes(order.status) &&
    order.lines.some((l) => l.qtyOutstandingBase > 0);

  const offered = order.availableActions.filter((a): a is typeof a & { action: Act } =>
    (['approve', 'reject', 'cancel', 'shortClose', 'close'] as string[]).includes(a.action),
  );

  const run = (act: Act, reason: string) => {
    const done = (msg: string) => () => {
      setActing(null);
      toast.success(msg);
    };
    const id = order.id;
    if (act === 'approve') {
      approve.mutate(
        { id, body: { reason } },
        { onSuccess: (o) => done(`${o.docNo} approved — stock reserved`)() },
      );
    } else if (act === 'reject') {
      reject.mutate({ id, body: { reason } }, { onSuccess: done('Sent back to draft') });
    } else if (act === 'shortClose') {
      shortClose.mutate(
        { id, body: { reason } },
        { onSuccess: done('Order short-closed — the rest released') },
      );
    } else if (act === 'close') {
      close.mutate(id, { onSuccess: done('Order closed') });
    } else {
      cancel.mutate(
        { id, body: reason ? { reason } : {} },
        { onSuccess: done('Order cancelled — reservations released') },
      );
    }
  };

  const credit = order.creditCheck;
  const reservedAny = order.lines.some((l) => l.qtyReservedBase > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardList}
        title={order.docNo ?? 'Order awaiting approval'}
        description={`${order.dealerName ?? 'Dealer'} · ordered ${new Date(order.orderDate).toLocaleDateString()}`}
        actions={
          <>
            <StatusPill status={order.status} />
            {canPick && (
              <Button
                disabled={startPick.isPending}
                onClick={() =>
                  startPick.mutate(
                    { orderId: order.id },
                    { onSuccess: (d) => navigate(`/dispatch/challans/${d.id}`) },
                  )
                }
              >
                <PackageSearch aria-hidden="true" />
                Start picking
              </Button>
            )}
            {offered.map((a) => {
              const Icon = ICON[a.action];
              return (
                <Button
                  key={a.action}
                  variant={
                    a.action === 'cancel'
                      ? 'outline'
                      : a.action === 'approve'
                        ? 'default'
                        : 'secondary'
                  }
                  className={a.action === 'cancel' ? 'text-destructive' : undefined}
                  disabled={pending}
                  onClick={() => setActing(a.action)}
                >
                  <Icon aria-hidden="true" />
                  {ACTS[a.action].label}
                </Button>
              );
            })}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-x-6 gap-y-3 pt-6 text-sm sm:grid-cols-2">
              <Detail label="Dealer">
                <Link
                  to={`/dealers/profile/${order.dealerPartyId}`}
                  className="font-medium hover:underline"
                >
                  {order.dealerName ?? order.dealerPartyId}
                </Link>
              </Detail>
              <Detail label="Ships from">{order.locationName ?? '—'}</Detail>
              <Detail label="Required by">
                {order.requiredDate ? new Date(order.requiredDate).toLocaleDateString() : '—'}
              </Detail>
              <Detail label="Payment terms">
                {order.paymentTermsDays ? `${order.paymentTermsDays} days` : 'Cash'}
              </Detail>
              <Detail label="Ship to" className="sm:col-span-2">
                {order.shippingAddress ?? '—'}
              </Detail>
              {order.note && (
                <Detail label="Note" className="sm:col-span-2">
                  {order.note}
                </Detail>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lines</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Dispatched</TableHead>
                    {progress.cancelledBase > 0 && (
                      <TableHead className="text-right">Cancelled</TableHead>
                    )}
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <p className="font-medium">{l.productName ?? l.sku}</p>
                        <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
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
                        {l.qtyReservedBase}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.qtyDispatchedBase}
                      </TableCell>
                      {progress.cancelledBase > 0 && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {l.qtyCancelledBase || '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {money(l.unitPriceMinor)}
                        {l.priceOverridden && (
                          <span className="block text-xs text-warning">overridden</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(l.lineTotalMinor)}
                        {l.discountMinor > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            − {money(l.discountMinor)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {order.docNo && order.status !== 'CANCELLED' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ProgressBar
                  label="Shipped"
                  value={progress.dispatched}
                  detail={`${progress.dispatchedBase} of ${progress.toShipBase}`}
                />
                <ProgressBar
                  label="Billed"
                  value={progress.invoiced}
                  detail={`${progress.invoicedBase} of ${progress.toShipBase}`}
                />
                {progress.cancelledBase > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {progress.cancelledBase} unit(s) short-closed — not shipped, not billed.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={money(order.subtotalMinor)} />
              {order.orderDiscountMinor > 0 && (
                <Row label="Order discount" value={`− ${money(order.orderDiscountMinor)}`} />
              )}
              {order.shippingMinor > 0 && (
                <Row label="Shipping" value={money(order.shippingMinor)} />
              )}
              <div className="border-t pt-2">
                <Row label="Grand total" value={money(order.grandTotalMinor)} strong />
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                {reservedAny
                  ? 'Stock for every line is reserved at the warehouse.'
                  : order.status === 'PENDING_APPROVAL'
                    ? 'Nothing is reserved until the order is approved.'
                    : 'Nothing is reserved.'}
              </p>
            </CardContent>
          </Card>

          {credit && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Credit check</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <StatusPill
                  status={credit.status}
                  tone={
                    credit.status === 'OK'
                      ? 'success'
                      : credit.status === 'BLOCKED'
                        ? 'danger'
                        : 'warning'
                  }
                />
                <Row label="Exposure before" value={money(credit.outstandingMinor)} />
                <Row label="With this order" value={money(credit.exposureMinor)} />
                <Row
                  label="Limit"
                  value={credit.limitMinor > 0 ? money(credit.limitMinor) : 'cash only'}
                />
                {credit.overrideReason && (
                  <p className="rounded-md bg-muted px-2 py-1.5 text-xs">
                    Overridden: “{credit.overrideReason}”
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {can('dispatch:read') && <OrderChallans orderId={order.id} />}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4" aria-hidden="true" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l pl-4 text-sm">
                {[...order.statusHistory].reverse().map((h, i) => (
                  <li key={`${h.at}-${i}`} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="font-medium">
                      {humanise(h.action)} → {humanise(h.to)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(h.at).toLocaleString()}
                    </p>
                    {h.reason && <p className="text-xs">“{h.reason}”</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {acting === 'close' && (
        <ConfirmDialog
          open
          onClose={() => setActing(null)}
          onConfirm={() => run('close', '')}
          pending={pending}
          title={ACTS.close.title}
          description={ACTS.close.description}
          confirmLabel={ACTS.close.label}
        />
      )}
      {acting && acting !== 'close' && (
        <ReasonDialog
          title={ACTS[acting].title}
          description={
            acting === 'shortClose' ? shortCloseText(order) : ACTS[acting].description
          }
          confirmLabel={ACTS[acting].label}
          optional={!offered.find((a) => a.action === acting)?.requiresReason}
          destructive={ACTS[acting].destructive}
          pending={pending}
          onConfirm={(reason) => run(acting, reason)}
          onClose={() => setActing(null)}
        />
      )}
    </div>
  );
}

function Detail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong ? 'flex justify-between text-base font-semibold' : 'flex justify-between'
      }
    >
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

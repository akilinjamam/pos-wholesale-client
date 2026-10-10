import { CheckCircle2, ShieldCheck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDateTime } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { useApproveOrder, useOrders, useRejectOrder } from '@/hooks/data/useOrders';

import { ReasonDialog } from './ReasonDialog';

import type { WholesaleOrderPayload } from '@shared/types';

/**
 * The approvals queue (Day 26): orders a sales rep confirmed that the credit check refused. Each
 * waits here — nothing reserved, no number — until a manager lends past the limit (approve, with a
 * reason that becomes the credit override) or sends it back to be amended.
 *
 * Oldest first: the dealer who has waited longest is the one on the phone.
 */
export function Approvals() {
  const { data, isLoading } = useOrders({
    status: 'PENDING_APPROVAL',
    sort: 'orderDate',
    order: 'asc',
    limit: 100,
  });
  const [acting, setActing] = useState<{
    order: WholesaleOrderPayload;
    act: 'approve' | 'reject';
  } | null>(null);
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const items = data?.items ?? [];

  const decide = (reason: string) => {
    if (!acting) return;
    const { order, act } = acting;
    const onSuccess = (o: WholesaleOrderPayload) => {
      setActing(null);
      toast.success(
        act === 'approve'
          ? `${o.docNo} approved — stock reserved`
          : `Sent back to ${order.dealerName}'s rep`,
      );
    };
    if (act === 'approve') approve.mutate({ id: order.id, body: { reason } }, { onSuccess });
    else reject.mutate({ id: order.id, body: { reason } }, { onSuccess });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        icon={ShieldCheck}
        description="Orders over their dealer's credit limit, waiting for a decision. Oldest first."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing waiting"
          description="Orders that go over a dealer's credit limit appear here for approval."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((o) => {
            const c = o.creditCheck;
            const over = c ? c.exposureMinor - c.limitMinor : 0;
            const submitted = [...o.statusHistory]
              .reverse()
              .find((h) => h.to === 'PENDING_APPROVAL');
            return (
              <li key={o.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
                    <div className="min-w-0 space-y-1">
                      <Link
                        to={`/sales/orders/${o.id}`}
                        className="font-semibold hover:underline"
                      >
                        {o.dealerName}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {o.lines.length} line(s) · {money(o.grandTotalMinor)} · from{' '}
                        {o.locationName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Waiting since {fmtDateTime(submitted?.at ?? o.updatedAt)}
                        {submitted?.reason && ` — “${submitted.reason}”`}
                      </p>
                    </div>

                    {c && (
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm tabular-nums sm:grid-cols-4">
                        <Fig label="Exposure before" value={money(c.outstandingMinor)} />
                        <Fig label="With this order" value={money(c.exposureMinor)} />
                        <Fig
                          label="Limit"
                          value={c.limitMinor > 0 ? money(c.limitMinor) : 'cash only'}
                        />
                        <Fig label="Over by" value={money(Math.max(0, over))} danger />
                      </dl>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setActing({ order: o, act: 'reject' })}
                      >
                        <Undo2 aria-hidden="true" />
                        Send back
                      </Button>
                      <Button onClick={() => setActing({ order: o, act: 'approve' })}>
                        <CheckCircle2 aria-hidden="true" />
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {acting && (
        <ReasonDialog
          title={
            acting.act === 'approve'
              ? `Approve ${acting.order.dealerName} over the limit?`
              : 'Send back to the sales rep?'
          }
          description={
            acting.act === 'approve'
              ? 'The order is confirmed and its stock reserved. Your reason is recorded as the credit override.'
              : 'The order returns to draft to be amended — fewer lines, or a payment first. Say what needs to change.'
          }
          confirmLabel={acting.act === 'approve' ? 'Approve' : 'Send back'}
          pending={approve.isPending || reject.isPending}
          onConfirm={decide}
          onClose={() => setActing(null)}
        />
      )}
    </div>
  );
}

function Fig({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={danger ? 'font-medium text-destructive' : undefined}>{value}</dd>
    </div>
  );
}

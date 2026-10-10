import { ArrowLeft, BookOpen, FileText, Printer, Undo2 } from 'lucide-react';
import { useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ReceiptButtons } from '@/features/counter/print/PrintControls';
import { A4Invoice, OffScreen } from '@/features/counter/print/PrintDocs';
import { METHOD_LABELS, usePrint } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { useCan } from '@/hooks/data/useAuth';
import { useInvoice } from '@/hooks/data/useDispatches';
import { useInvoiceActivity } from '@/hooks/data/useInvoices';
import { useOrg } from '@/hooks/data/useOrg';
import { humanise } from '@/lib/utils';

import { daysOverdue } from './invoiceFormat';

import type { InvoiceActivity, InvoicePayload, PaymentDocPayload } from '@shared/types';

/**
 * One invoice (Day 36b): what was sold, what has settled it — payments and credit notes — what
 * came back against it, and a reprint. Read-only: an invoice changes only through the documents
 * that pay, credit or return against it.
 */
export function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useInvoice(id);
  const activity = useInvoiceActivity(id);

  if (invoice.isLoading) return <Skeleton className="h-96" />;
  if (!invoice.data) return <EmptyState icon={FileText} title="No such invoice" />;
  return <InvoiceView inv={invoice.data} activity={activity.data} />;
}

function InvoiceView({ inv, activity }: { inv: InvoicePayload; activity?: InvoiceActivity }) {
  const navigate = useNavigate();
  const can = useCan();
  const { data: org } = useOrg();
  const a4Ref = useRef<HTMLDivElement>(null);
  const printA4 = usePrint(a4Ref, 'A4', `Invoice ${inv.docNo ?? ''}`);
  const wholesale = inv.channel === 'WHOLESALE';
  const opening = inv.series === 'OB';
  const late = daysOverdue(inv);
  const payments: PaymentDocPayload[] = (activity?.payments ?? [])
    .filter((p) => !p.reversedAt)
    .map((p) => ({
      id: p.id,
      docNo: p.docNo,
      method: p.method,
      amountMinor: p.amountMinor,
      paidAt: p.paidAt,
    }));
  const returnable = inv.lines.some((l) => l.qtyReturnedBase < l.qtyBase);

  return (
    <div className="space-y-5">
      <PageHeader
        title={inv.docNo ?? 'Invoice'}
        icon={FileText}
        description={`${inv.customerName ?? 'Walk-in'} · ${new Date(inv.invoiceDate).toLocaleDateString()} · ${
          opening ? 'opening balance' : humanise(inv.channel).toLowerCase()
        }${inv.locationName ? ` · ${inv.locationName}` : ''}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            {inv.partyId && can('ledger:read') && (
              <Button
                variant="outline"
                onClick={() => navigate(`/receivables/statement?partyId=${inv.partyId}`)}
              >
                <BookOpen aria-hidden="true" />
                Statement
              </Button>
            )}
            {wholesale &&
              !opening &&
              inv.status === 'POSTED' &&
              returnable &&
              can('return:create') && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/sales/returns/new?invoiceId=${inv.id}`)}
                >
                  <Undo2 aria-hidden="true" />
                  Return goods
                </Button>
              )}
            {!opening &&
              (wholesale ? (
                <Button onClick={printA4}>
                  <Printer aria-hidden="true" />
                  Print invoice
                </Button>
              ) : (
                <ReceiptButtons
                  sale={{ invoice: inv, payments, changeMinor: 0, replayed: true }}
                  reprint
                />
              ))}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              {opening ? (
                <p className="text-sm text-muted-foreground">
                  What the dealer owed when the books moved to this system — one amount, no
                  lines.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inv.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <p className="font-medium">{l.description}</p>
                          {l.serials.length > 0 && (
                            <p className="font-mono text-xs text-muted-foreground">
                              {l.serials.join(', ')}
                            </p>
                          )}
                          {l.qtyReturnedBase > 0 && (
                            <p className="text-xs text-warning">{l.qtyReturnedBase} returned</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.uomQty} {l.uomCode}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(l.unitPriceMinor)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.discountMinor ? `−${money(l.discountMinor)}` : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(l.lineTotalMinor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {activity && activity.returns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Returns against it</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {activity.returns.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-mono">{r.docNo}</span>{' '}
                      <span className="text-muted-foreground">
                        · {new Date(r.postedAt).toLocaleDateString()} · {r.qtyBase} unit(s)
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusPill
                        status={r.settlement}
                        tone={r.settlement === 'CREDIT_NOTE' ? 'info' : 'warning'}
                      />
                      <span className="font-mono text-xs">
                        {r.creditNoteDocNo ?? r.refundDocNo}
                      </span>
                      <span className="tabular-nums">{money(r.grandTotalMinor)}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 pt-6 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="flex items-center gap-2">
                  {late && (
                    <Badge
                      variant="outline"
                      className="border-destructive/40 py-0 text-destructive"
                    >
                      {late}d overdue
                    </Badge>
                  )}
                  <StatusPill status={inv.paymentStatus} />
                </span>
              </div>
              {!opening && <Row label="Subtotal" value={money(inv.subtotalMinor)} />}
              {inv.discountMinor > 0 && (
                <Row label="Discount" value={`−${money(inv.discountMinor)}`} />
              )}
              {inv.shippingMinor > 0 && (
                <Row label="Shipping" value={money(inv.shippingMinor)} />
              )}
              <Row label="Total" value={money(inv.grandTotalMinor)} strong />
              <Row label="Paid" value={money(inv.paidMinor)} />
              {inv.creditedMinor > 0 && (
                <Row label="Credited" value={money(inv.creditedMinor)} />
              )}
              <Row label="Still owed" value={money(inv.balanceMinor)} strong />
              {inv.dueDate && (
                <Row label="Due" value={new Date(inv.dueDate).toLocaleDateString()} />
              )}
              {inv.orderId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Order</span>
                  <Link to={`/sales/orders/${inv.orderId}`} className="text-primary underline">
                    Open order
                  </Link>
                </div>
              )}
              {inv.dispatchId && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Challan</span>
                  <Link
                    to={`/dispatch/challans/${inv.dispatchId}`}
                    className="text-primary underline"
                  >
                    Open challan
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Settled by</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!activity ? (
                <Skeleton className="h-16" />
              ) : activity.payments.length + activity.creditNotes.length === 0 ? (
                <p className="text-muted-foreground">Nothing yet.</p>
              ) : (
                <>
                  {activity.payments.map((p) => (
                    <div
                      key={`${p.id}-${p.paidAt}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className={p.reversedAt ? 'line-through opacity-60' : undefined}>
                        <span className="font-mono">{p.docNo}</span>{' '}
                        <span className="text-muted-foreground">
                          · {METHOD_LABELS[p.method] ?? humanise(p.method)}
                          {p.chequeNo ? ` ${p.chequeNo}` : ''} ·{' '}
                          {new Date(p.paidAt).toLocaleDateString()}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {money(p.amountMinor)}
                        {p.reversedAt && (
                          <span className="block text-xs text-destructive">reversed</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {activity.creditNotes.map((c) => (
                    <div
                      key={`${c.id}-${c.allocatedAt}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        <span className="font-mono">{c.docNo}</span>{' '}
                        <span className="text-muted-foreground">
                          · credit for {c.salesReturnDocNo}
                        </span>
                      </span>
                      <span className="tabular-nums">{money(c.amountMinor)}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {wholesale && !opening && (
        <OffScreen>
          <A4Invoice ref={a4Ref} invoice={inv} payments={payments} org={org} />
        </OffScreen>
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

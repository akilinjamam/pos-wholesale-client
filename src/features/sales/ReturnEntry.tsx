import { CheckCircle2, Copy, Loader2, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { DealerPicker } from '@/components/common/DealerPicker';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { money } from '@/features/dealers/creditMath';
import { errorMap } from '@/features/inventory/docHelpers';
import { useCan } from '@/hooks/data/useAuth';
import { useLocations } from '@/hooks/data/useLocations';
import {
  useDealerInvoices,
  usePostWholesaleReturn,
  useReturnableInvoice,
} from '@/hooks/data/useReturns';
import { cn, humanise } from '@/lib/utils';

import { RETURN_REASONS } from '@shared/enums';
import { REFUND_METHODS } from '@shared/returns';

import type { ReturnReason } from '@shared/enums';
import type { RefundMethod, WholesaleReturnSettlement } from '@shared/returns';
import type {
  PartyPayload,
  ReturnableWholesaleInvoice,
  WholesaleReturnResult,
} from '@shared/types';

/**
 * A wholesale return (Day 36): a dealer's goods back against one of their invoices.
 *
 * Each row says how many came back, in what condition, and where they go — good stock to a
 * selling location, damaged to a damage location. The same invoice line can come back on two rows
 * ("Split") when some of it is fine and some is not. It settles as a credit note, set against this
 * invoice by default, or — with `return:approve`, for goods already paid for — money back.
 */

interface Row {
  key: number;
  invoiceLineId: string;
  qty: string;
  serials: string[];
  condition: 'GOOD' | 'DAMAGED';
  locationId: string;
}

let nextKey = 1;

export function ReturnEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [dealer, setDealer] = useState<PartyPayload | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(params.get('invoiceId'));
  const [search, setSearch] = useState('');
  const invoices = useDealerInvoices(dealer?.id ?? null, search);
  const returnable = useReturnableInvoice(invoiceId);
  const [done, setDone] = useState<WholesaleReturnResult | null>(null);

  if (done)
    return (
      <Done
        result={done}
        onAnother={() => {
          setDone(null);
          setInvoiceId(null);
        }}
        onList={() => navigate('/sales/returns')}
      />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="New return"
        icon={Undo2}
        description="Goods back from a dealer, against one of their invoices."
      />
      {!invoiceId ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="max-w-md">
              <DealerPicker value={dealer} onChange={setDealer} emptyLabel="Which dealer?" />
            </div>
            {dealer && (
              <>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Invoice number…"
                  className="max-w-xs"
                  aria-label="Search invoices"
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Owed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoices.data?.items ?? [])
                      .filter((i) => i.status === 'POSTED')
                      .map((i) => (
                        <TableRow
                          key={i.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setInvoiceId(i.id)}
                        >
                          <TableCell className="font-mono text-sm">{i.docNo}</TableCell>
                          <TableCell className="text-sm">
                            {i.invoiceDate.slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(i.grandTotalMinor)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(i.balanceMinor)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {invoices.data?.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No wholesale invoices for this dealer.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : !returnable.data ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : (
        <ReturnForm
          key={invoiceId}
          data={returnable.data}
          onBack={() => setInvoiceId(null)}
          onDone={setDone}
        />
      )}
    </div>
  );
}

function ReturnForm({
  data,
  onBack,
  onDone,
}: {
  data: ReturnableWholesaleInvoice;
  onBack: () => void;
  onDone: (r: WholesaleReturnResult) => void;
}) {
  const can = useCan();
  const canRefund = can('return:approve');
  const { data: locs } = useLocations({ limit: 200, isActive: true });
  const locations = (locs?.items ?? []).filter((l) => l.type !== 'TRANSIT');
  const shelves = locations.filter((l) => l.type !== 'DAMAGE');
  const damageRooms = locations.filter((l) => l.type === 'DAMAGE');
  const inv = data.invoice;
  const lineBy = new Map(data.lines.map((l) => [l.invoiceLineId, l]));
  const shelfDefault = data.defaultLocationId ?? shelves[0]?.id ?? '';

  const [rows, setRows] = useState<Row[]>(() =>
    data.lines
      .filter((l) => l.returnableBase > 0)
      .map((l) => ({
        key: nextKey++,
        invoiceLineId: l.invoiceLineId,
        qty: '',
        serials: [],
        condition: 'GOOD',
        locationId: shelfDefault,
      })),
  );
  const [reason, setReason] = useState<ReturnReason>('DAMAGED');
  const [settlement, setSettlement] = useState<WholesaleReturnSettlement>('CREDIT_NOTE');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const post = usePostWholesaleReturn();

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const qtyOf = (r: Row) =>
    lineBy.get(r.invoiceLineId)?.serials.length ? r.serials.length : Number(r.qty) || 0;
  const sending = rows.filter((r) => qtyOf(r) > 0);
  // Which sent row each server error index points at.
  const rowAt = (i: number) => sending[i]?.key;
  const errorFor = (key: number) =>
    Object.entries(errors).find(([path]) => {
      const m = /^lines\.(\d+)\./.exec(path);
      return m && rowAt(Number(m[1])) === key;
    })?.[1];
  const estimate = sending.reduce(
    (t, r) => t + qtyOf(r) * (lineBy.get(r.invoiceLineId)?.unitValueMinor ?? 0),
    0,
  );

  const submit = () => {
    setErrors({});
    post.mutate(
      {
        invoiceId: inv.id,
        reason,
        settlement,
        note: note.trim() || null,
        lines: sending.map((r) => ({
          invoiceLineId: r.invoiceLineId,
          qtyBase: qtyOf(r),
          condition: r.condition,
          restockLocationId: r.locationId,
          ...(r.serials.length ? { serials: r.serials } : {}),
        })),
        ...(settlement === 'CREDIT_NOTE' && leaveOpen ? { allocations: [] } : {}),
        ...(settlement === 'CASH_REFUND'
          ? { refundMethod, reference: reference.trim() || null }
          : {}),
      },
      {
        onSuccess: (r) => {
          toast.success(`${r.salesReturn.docNo} posted`);
          onDone(r);
        },
        onError: (e) => setErrors(errorMap(e)),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">
              {inv.docNo} · {inv.customerName}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {inv.invoiceDate.slice(0, 10)} · total {money(inv.grandTotalMinor)} · owed{' '}
              {money(inv.balanceMinor)}
              {data.previousReturns.length > 0 &&
                ` · ${data.previousReturns.length} earlier return(s)`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Another invoice
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {damageRooms.length === 0 && (
            <p className="text-sm text-warning">
              No damage location is set up — damaged goods cannot be taken back until there is
              one.
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Can return</TableHead>
                <TableHead>Coming back</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Goes to</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const l = lineBy.get(r.invoiceLineId)!;
                const err = errorFor(r.key);
                const options = r.condition === 'DAMAGED' ? damageRooms : shelves;
                return (
                  <TableRow key={r.key}>
                    <TableCell>
                      <p className="font-medium">{l.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.lotNo ? `lot ${l.lotNo} · ` : ''}~{money(l.unitValueMinor)} /{' '}
                        {l.baseUom}
                      </p>
                      {err && (
                        <p className="mt-1 text-xs font-medium text-destructive">{err}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.returnableBase}
                    </TableCell>
                    <TableCell>
                      {l.serials.length > 0 ? (
                        <div className="flex max-w-xs flex-wrap gap-x-3 gap-y-1">
                          {l.serials.map((sn) => (
                            <label
                              key={sn}
                              className="flex items-center gap-1 font-mono text-xs"
                            >
                              <Checkbox
                                checked={r.serials.includes(sn)}
                                onChange={(e) =>
                                  update(r.key, {
                                    serials: e.target.checked
                                      ? [...r.serials, sn]
                                      : r.serials.filter((s) => s !== sn),
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
                          max={l.returnableBase}
                          value={r.qty}
                          onChange={(e) => update(r.key, { qty: e.target.value })}
                          placeholder="0"
                          className="w-24 tabular-nums"
                          aria-label={`Quantity back, ${l.description}`}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={r.condition}
                        onChange={(e) => {
                          const condition = e.target.value as Row['condition'];
                          update(r.key, {
                            condition,
                            locationId:
                              condition === 'DAMAGED'
                                ? (damageRooms[0]?.id ?? '')
                                : shelfDefault,
                          });
                        }}
                        aria-label={`Condition, ${l.description}`}
                        className={cn('w-32', r.condition === 'DAMAGED' && 'text-destructive')}
                      >
                        <option value="GOOD">Good</option>
                        <option value="DAMAGED">Damaged</option>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={r.locationId}
                        onChange={(e) => update(r.key, { locationId: e.target.value })}
                        aria-label={`Destination, ${l.description}`}
                        className="w-48"
                      >
                        {options.length === 0 ? (
                          <option value="">None set up</option>
                        ) : (
                          !options.some((o) => o.id === r.locationId) && (
                            <option value="">Choose…</option>
                          )
                        )}
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Split ${l.description} into another row`}
                        title="Split — some good, some damaged"
                        onClick={() =>
                          setRows((rs) => {
                            const at = rs.findIndex((x) => x.key === r.key);
                            const copy: Row = {
                              ...r,
                              key: nextKey++,
                              qty: '',
                              serials: [],
                              condition: 'DAMAGED',
                              locationId: damageRooms[0]?.id ?? '',
                            };
                            return [...rs.slice(0, at + 1), copy, ...rs.slice(at + 1)];
                          })
                        }
                      >
                        <Copy />
                      </Button>
                      {rows.filter((x) => x.invoiceLineId === r.invoiceLineId).length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          aria-label="Remove this row"
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Labelled label="Reason">
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value as ReturnReason)}
              aria-label="Reason"
            >
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {humanise(r)}
                </option>
              ))}
            </Select>
          </Labelled>
          <Labelled label="Settle as">
            <Select
              value={settlement}
              onChange={(e) => setSettlement(e.target.value as WholesaleReturnSettlement)}
              aria-label="Settlement"
            >
              <option value="CREDIT_NOTE">Credit note</option>
              {canRefund && <option value="CASH_REFUND">Money back (refund)</option>}
            </Select>
          </Labelled>
          {settlement === 'CREDIT_NOTE' ? (
            <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
              <Checkbox checked={leaveOpen} onChange={(e) => setLeaveOpen(e.target.checked)} />
              Leave the credit open — don’t set it against {inv.docNo}
            </label>
          ) : (
            <>
              <Labelled label="Refund by">
                <Select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}
                  aria-label="Refund method"
                >
                  {REFUND_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {humanise(m)}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label="Reference">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  aria-label="Reference"
                />
              </Labelled>
            </>
          )}
          <Labelled label="Note" className="sm:col-span-2 lg:col-span-4">
            <Input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          </Labelled>
          {(errors.settlement || errors.allocations || errors.invoiceId) && (
            <p
              role="alert"
              className="text-sm font-medium text-destructive sm:col-span-2 lg:col-span-4"
            >
              {errors.settlement ?? errors.allocations ?? errors.invoiceId}
            </p>
          )}
          <div className="flex items-center justify-end gap-3 sm:col-span-2 lg:col-span-4">
            <span className="text-sm text-muted-foreground">
              About <strong className="tabular-nums text-foreground">{money(estimate)}</strong>{' '}
              — the exact value is worked out on posting.
            </span>
            <Button onClick={submit} disabled={post.isPending || sending.length === 0}>
              {post.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Post return
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Done({
  result,
  onAnother,
  onList,
}: {
  result: WholesaleReturnResult;
  onAnother: () => void;
  onList: () => void;
}) {
  const r = result.salesReturn;
  const cn = result.creditNote;
  return (
    <div className="space-y-5">
      <PageHeader
        title={`Return ${r.docNo}`}
        icon={Undo2}
        description={`${r.customerName} · against ${r.invoiceDocNo} · ${money(r.grandTotalMinor)}`}
      />
      <Card className="max-w-2xl">
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Posted — goods back in stock
          </p>
          {cn ? (
            <ul className="divide-y rounded-md border">
              <li className="flex justify-between gap-3 px-3 py-2 font-medium">
                <span>Credit note {cn.docNo}</span>
                <span className="tabular-nums">{money(cn.amountMinor)}</span>
              </li>
              {cn.allocations.map((a) => (
                <li key={a.invoiceId} className="flex justify-between gap-3 px-3 py-2">
                  <span>Set against {a.docNo}</span>
                  <span className="tabular-nums">{money(a.amountMinor)}</span>
                </li>
              ))}
              {cn.unallocatedMinor > 0 && (
                <li className="flex justify-between gap-3 px-3 py-2">
                  <span>Open credit, to set against a later invoice</span>
                  <span className="tabular-nums">{money(cn.unallocatedMinor)}</span>
                </li>
              )}
            </ul>
          ) : (
            <p>Refunded as {r.refundDocNo}.</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onAnother}>
              Another return
            </Button>
            <Button variant="ghost" onClick={onList}>
              All returns
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Labelled({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

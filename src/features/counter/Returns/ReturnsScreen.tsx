import { Loader2, Printer, Repeat, RotateCcw, ScanLine, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { errorMessage } from '@/api/client';
import { useAppDispatch } from '@/app/store';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useOrg } from '@/hooks/data/useOrg';
import {
  useCurrentSession,
  usePostReturn,
  useRefundExchange,
  useReturnable,
  useReturns,
  useSale,
} from '@/hooks/data/usePos';
import { posCart } from '@/store/posCartSlice';

import { ReceiptButtons } from '../print/PrintControls';
import { OffScreen, ReturnSlip } from '../print/PrintDocs';
import { fmtDateTime, loadPrintSettings, usePrint } from '../print/printHelpers';
import { money } from '../Sale/saleHelpers';

import { RETURN_REASONS } from '@shared/enums';

import type { CounterReturnSettlement } from '@shared/pos';
import type { ReturnableInvoice, SalesReturnPayload } from '@shared/types';

/**
 * Counter returns (Day 20): scan the receipt's barcode (or type its number), choose what came
 * back, and settle — cash back, an exchange, or a credit on the dealer's account. The server
 * prices the return from the invoice itself; the figures here are a preview.
 */

const REASON_LABELS: Record<(typeof RETURN_REASONS)[number], string> = {
  DAMAGED: 'Damaged / faulty',
  WRONG_ITEM: 'Wrong item',
  NOT_SOLD: 'Changed mind',
  WARRANTY: 'Warranty claim',
  OTHER: 'Other',
};

const SETTLEMENT_LABELS: Record<CounterReturnSettlement, { label: string; hint: string }> = {
  CASH_REFUND: { label: 'Refund cash', hint: 'Cash out of the drawer' },
  REPLACEMENT: { label: 'Exchange', hint: 'Credit to spend on a new sale now' },
  CREDIT_NOTE: { label: 'Credit the account', hint: 'Reduces what the dealer owes' },
};

const newRef = () => crypto.randomUUID();

export function ReturnsScreen() {
  const session = useCurrentSession();
  const [text, setText] = useState('');
  const [docNo, setDocNo] = useState<string | null>(null);
  const returnable = useReturnable(docNo);
  const [done, setDone] = useState<SalesReturnPayload | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Counter returns"
        description="Refund or exchange against a counter receipt"
        icon={Undo2}
      />

      {!session.isPending && !session.data && (
        <Card>
          <CardContent className="p-4 text-sm">
            Open a shift at the till first — a refund comes out of its drawer.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = text.trim().toUpperCase();
              if (v) setDocNo(v);
            }}
            className="relative"
          >
            <ScanLine
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Scan the receipt barcode or type its number — POS-2627-00012"
              aria-label="Receipt number"
              className="h-12 pl-11 font-mono text-base uppercase"
              disabled={!session.data}
            />
          </form>

          {returnable.isFetching && (
            <Loader2
              className="mx-auto h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )}
          {returnable.isError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errorMessage(returnable.error)}
            </p>
          )}
          {returnable.data && session.data && (
            <ReturnForm
              key={returnable.data.invoice.id + returnable.dataUpdatedAt}
              data={returnable.data}
              onPosted={(r) => {
                setDone(r);
                void returnable.refetch();
              }}
            />
          )}
        </div>

        <aside className="space-y-4">
          {session.data && <OpenExchanges />}
          {session.data && <ShiftReturns sessionId={session.data.id} onOpen={setDone} />}
        </aside>
      </div>

      {done && <DoneDialog ret={done} onClose={() => setDone(null)} />}
    </div>
  );
}

// ─── The form ───────────────────────────────────────────────────────────────────────────

interface Pick {
  qty: number;
  serials: string[];
  condition: 'GOOD' | 'DAMAGED';
}

function ReturnForm({
  data,
  onPosted,
}: {
  data: ReturnableInvoice;
  onPosted: (r: SalesReturnPayload) => void;
}) {
  const post = usePostReturn();
  const sale = useSale(data.invoice.id);
  const inv = data.invoice;
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [reason, setReason] = useState<(typeof RETURN_REASONS)[number]>('NOT_SOLD');
  const [settlement, setSettlement] = useState<CounterReturnSettlement>(data.settlements[0]!);
  const [note, setNote] = useState('');
  const [clientRef, setClientRef] = useState(newRef);
  const [error, setError] = useState<string | null>(null);

  const pick = (id: string): Pick => picks[id] ?? { qty: 0, serials: [], condition: 'GOOD' };
  const update = (id: string, p: Partial<Pick>) =>
    setPicks({ ...picks, [id]: { ...pick(id), ...p } });

  // A preview: the server prices it from the invoice, with rounding that keeps pieces exact.
  const preview = inv.lines.reduce((s, l) => {
    const q = pick(l.id).qty;
    return s + (q > 0 ? Math.round((l.lineTotalMinor * q) / l.qtyBase) : 0);
  }, 0);
  const chosen = inv.lines.filter((l) => pick(l.id).qty > 0);

  const submit = () => {
    setError(null);
    post.mutate(
      {
        clientRef,
        invoiceId: inv.id,
        reason,
        settlement,
        note: note.trim() || null,
        lines: chosen.map((l) => {
          const p = pick(l.id);
          return {
            invoiceLineId: l.id,
            qtyBase: p.qty,
            condition: p.condition,
            ...(p.serials.length ? { serials: p.serials } : {}),
          };
        }),
      },
      {
        onSuccess: ({ salesReturn }) => {
          setClientRef(newRef());
          onPosted(salesReturn);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-semibold">{inv.docNo}</p>
            <p className="text-sm text-muted-foreground">
              {fmtDateTime(inv.postedAt)} · {inv.customerName ?? 'Walk-in'} · total{' '}
              {money(inv.grandTotalMinor)}
              {inv.creditedMinor > 0 && <> · {money(inv.creditedMinor)} already returned</>}
            </p>
          </div>
          <div className="flex gap-2">
            {sale.data && <ReceiptButtons sale={sale.data} reprint />}
          </div>
        </div>

        <ul className="divide-y rounded-md border">
          {inv.lines.map((l, i) => {
            const r = data.returnable[i]!;
            const p = pick(l.id);
            const serial = r.trackingMode === 'SERIAL';
            return (
              <li key={l.id} className={cn('space-y-2 p-3', r.qtyBase === 0 && 'opacity-50')}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Sold {l.qtyBase} {r.baseUom} for {money(l.lineTotalMinor)}
                      {l.qtyReturnedBase > 0 && ` · ${l.qtyReturnedBase} already back`}
                    </p>
                  </div>
                  {r.qtyBase === 0 ? (
                    <Badge variant="secondary">returned</Badge>
                  ) : (
                    <>
                      {!serial && (
                        <label className="flex items-center gap-2 text-sm">
                          Back
                          <Input
                            type="number"
                            min={0}
                            max={r.qtyBase}
                            value={p.qty || ''}
                            placeholder="0"
                            onChange={(e) =>
                              update(l.id, {
                                qty: Math.min(
                                  r.qtyBase,
                                  Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                ),
                              })
                            }
                            className="h-9 w-20 text-right tabular-nums"
                            aria-label={`How many ${l.description} came back (of ${r.qtyBase})`}
                          />
                          <span className="text-muted-foreground">/ {r.qtyBase}</span>
                        </label>
                      )}
                      <Select
                        value={p.condition}
                        onChange={(e) =>
                          update(l.id, { condition: e.target.value as Pick['condition'] })
                        }
                        className="h-9 w-32"
                        aria-label={`Condition of ${l.description}`}
                      >
                        <option value="GOOD">Resellable</option>
                        <option value="DAMAGED">Damaged</option>
                      </Select>
                    </>
                  )}
                </div>
                {serial && r.serials.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {r.serials.map((sn) => (
                      <label key={sn} className="flex items-center gap-1.5 font-mono text-sm">
                        <Checkbox
                          checked={p.serials.includes(sn)}
                          onChange={(e) => {
                            const v = e.target.checked;
                            const serials = v
                              ? [...p.serials, sn]
                              : p.serials.filter((x) => x !== sn);
                            update(l.id, { serials, qty: serials.length });
                          }}
                        />
                        {sn}
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Why</span>
            <Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Note</span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Optional"
            />
          </label>
        </div>

        <div role="radiogroup" aria-label="Settle as" className="grid gap-2 sm:grid-cols-2">
          {data.settlements.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={settlement === s}
              onClick={() => setSettlement(s)}
              className={cn(
                'rounded-md border p-3 text-left text-sm',
                settlement === s ? 'border-primary bg-primary/5' : 'text-muted-foreground',
              )}
            >
              <span className="block font-medium text-foreground">
                {SETTLEMENT_LABELS[s].label}
              </span>
              {SETTLEMENT_LABELS[s].hint}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-3">
          <span className="text-sm text-muted-foreground">
            {chosen.length} line(s) · about{' '}
            <strong className="tabular-nums text-foreground">{money(preview)}</strong>
          </span>
          <Button onClick={submit} disabled={chosen.length === 0 || post.isPending}>
            {post.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Post return
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── After posting ──────────────────────────────────────────────────────────────────────

function DoneDialog({ ret, onClose }: { ret: SalesReturnPayload; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: org } = useOrg();
  const [settings] = useState(loadPrintSettings);
  const slipRef = useRef<HTMLDivElement>(null);
  const printSlip = usePrint(slipRef, settings.paper, `Return ${ret.docNo}`);
  const exchangeOpen = ret.settlement === 'REPLACEMENT' && !ret.replacementInvoiceId;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        printSlip();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [printSlip]);

  const startExchange = () => {
    dispatch(
      posCart.setExchange({
        returnId: ret.id,
        docNo: ret.docNo,
        amountMinor: ret.grandTotalMinor,
      }),
    );
    navigate('/counter/sale');
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Return ${ret.docNo}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={printSlip}>
            <Printer aria-hidden="true" />
            Slip (P)
          </Button>
          {exchangeOpen ? (
            <Button data-autofocus onClick={startExchange}>
              <Repeat aria-hidden="true" />
              Start the exchange sale
            </Button>
          ) : (
            <Button data-autofocus onClick={onClose}>
              Done
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-2 text-center">
        <RotateCcw className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Against {ret.invoiceDocNo}</p>
        {ret.settlement === 'CASH_REFUND' && (
          <p>
            <span className="block text-sm text-muted-foreground">Hand back</span>
            <span className="text-4xl font-semibold tabular-nums">
              {money(ret.grandTotalMinor)}
            </span>
          </p>
        )}
        {ret.settlement === 'CREDIT_NOTE' && (
          <p className="text-sm">
            {money(ret.grandTotalMinor)} credited to the account ({ret.creditNoteDocNo}).
          </p>
        )}
        {ret.settlement === 'REPLACEMENT' && (
          <p className="text-sm">
            {money(ret.grandTotalMinor)} exchange credit{' '}
            {ret.replacementDocNo
              ? `spent on ${ret.replacementDocNo}`
              : '— spend it on the new sale.'}
          </p>
        )}
      </div>
      <OffScreen>
        <ReturnSlip ref={slipRef} ret={ret} org={org} paper={settings.paper} />
      </OffScreen>
    </Dialog>
  );
}

// ─── Side lists ─────────────────────────────────────────────────────────────────────────

/** Exchange credits nobody has spent yet — use one at the till, or give the cash back. */
function OpenExchanges() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data } = useReturns({ openExchange: true, limit: 10 });
  const refund = useRefundExchange();
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <p className="text-sm font-medium">Unspent exchange credit</p>
        {items.map((r) => (
          <div key={r.id} className="space-y-1 rounded-md border p-2 text-sm">
            <div className="flex justify-between">
              <span className="font-mono">{r.docNo}</span>
              <span className="font-semibold tabular-nums">{money(r.grandTotalMinor)}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dispatch(
                    posCart.setExchange({
                      returnId: r.id,
                      docNo: r.docNo,
                      amountMinor: r.grandTotalMinor,
                    }),
                  );
                  navigate('/counter/sale');
                }}
              >
                Use at till
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refund.mutate(r.id)}
                disabled={refund.isPending}
              >
                Refund cash
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ShiftReturns({
  sessionId,
  onOpen,
}: {
  sessionId: string;
  onOpen: (r: SalesReturnPayload) => void;
}) {
  const { data } = useReturns({ posSessionId: sessionId, limit: 20 });
  const items = data?.items ?? [];
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <p className="text-sm font-medium">This shift’s returns</p>
        {items.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
        {items.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r)}
            className="flex w-full justify-between gap-2 rounded px-1 py-1 text-left text-sm hover:bg-accent"
          >
            <span className="font-mono">{r.docNo}</span>
            <span className="text-xs text-muted-foreground">
              {SETTLEMENT_LABELS[r.settlement as CounterReturnSettlement]?.label}
            </span>
            <span className="tabular-nums">{money(r.grandTotalMinor)}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

import {
  Ban,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  PackageCheck,
  Printer,
  Save,
  Truck,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { errorCode, errorDetails, errorMessage, fieldErrors } from '@/api/client';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { A4Invoice, OffScreen } from '@/features/counter/print/PrintDocs';
import { fmtDateTime, usePrint } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { ReasonDialog } from '@/features/sales/ReasonDialog';
import { useCan } from '@/hooks/data/useAuth';
import {
  useCancelDispatch,
  useDeliverDispatch,
  useDispatch,
  useInvoice,
  usePackDispatch,
  usePostDispatch,
  useUpdateDispatch,
} from '@/hooks/data/useDispatches';
import { useOrder } from '@/hooks/data/useOrders';
import { useOrg } from '@/hooks/data/useOrg';

import {
  boxesInput,
  captureGaps,
  rowsOf,
  toLineInputs,
  toTransportInput,
  transportOf,
} from './challanDraft';
import { BoxesEditor, PackGrid, TransportFields } from './ChallanPanels';
import { ChallanDoc, PickSheet } from './print/DispatchDocs';
import { SignaturePad } from './SignaturePad';

import { toMinor } from '@shared/money';

import type { BoxDraft } from './challanDraft';
import type { DispatchPayload, WholesaleOrderPayload } from '@shared/types';

/**
 * One challan, from pick list to proof of delivery (§11 Dispatch, Day 25).
 *
 *   DRAFT       the pick list: quantities, then lots and serials as they come off the shelf;
 *               print the pick sheet; Pack.
 *   PACKED      boxes and transport; Post — stock leaves and the invoice is raised.
 *   DISPATCHED  print the challan and its invoice; record delivery when the dealer signs.
 *   DELIVERED   the proof of delivery.
 */
export function ChallanPage() {
  const { id } = useParams<{ id: string }>();
  const q = useDispatch(id);
  const order = useOrder(q.data?.orderId);

  if (q.isPending) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (!q.data) return <EmptyState title="Challan not found" />;
  // Re-mount the editor when the challan moves on, so its form starts from the saved state.
  return <Challan key={`${q.data.id}-${q.data.status}`} d={q.data} order={order.data} />;
}

function Challan({
  d,
  order,
}: {
  d: DispatchPayload;
  order: WholesaleOrderPayload | undefined;
}) {
  const can = useCan();
  const { data: org } = useOrg();
  const invoice = useInvoice(can('invoice:read') ? d.invoiceId : null);

  const draft = d.status === 'DRAFT';
  const open = draft || d.status === 'PACKED';
  const canEdit = open && can('dispatch:create');

  const [rows, setRows] = useState(() => rowsOf(d));
  const [transport, setTransport] = useState(() => transportOf(d));
  const [boxes, setBoxes] = useState<BoxDraft[]>(() =>
    d.packages.map((p) => ({ boxNo: p.boxNo, weightKg: p.weightKg ? String(p.weightKg) : '' })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<'post' | 'override' | 'cancel' | null>(null);
  const [shortfall, setShortfall] = useState<number | null>(null);

  const update = useUpdateDispatch();
  const pack = usePackDispatch();
  const post = usePostDispatch();
  const cancel = useCancelDispatch();
  const busy = update.isPending || pack.isPending || post.isPending || cancel.isPending;

  const outstanding = new Map(
    (order?.lines ?? []).map((l) => [l.id, l.qtyOutstandingBase] as const),
  );
  const gaps = draft ? captureGaps(rows) : [];
  const shipTo = order?.shippingAddress ?? null;

  // ── Printing ──
  const pickRef = useRef<HTMLDivElement>(null);
  const challanRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const printPick = usePrint(pickRef, 'A4', `Pick list ${d.orderDocNo ?? ''}`);
  const printChallan = usePrint(challanRef, 'A4', `Challan ${d.docNo ?? ''}`);
  const printInvoice = usePrint(invoiceRef, 'A4', `Invoice ${d.invoiceDocNo ?? ''}`);

  // ── Saving ──
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setDirty(true);
      setErrors({});
    };

  const save = async (): Promise<boolean> => {
    try {
      await update.mutateAsync({
        id: d.id,
        body: {
          ...(draft ? { lines: toLineInputs(rows) } : {}),
          transport: toTransportInput(transport, toMinor),
          packages: boxesInput(boxes),
        },
      });
      setDirty(false);
      return true;
    } catch (error) {
      const f = fieldErrors(error);
      if (f.length) {
        setErrors(Object.fromEntries(f.map((x) => [x.path, x.message])));
        toast.error('Some lines need attention');
      }
      return false;
    }
  };

  const onPack = async () => {
    if (!(await save())) return;
    try {
      await pack.mutateAsync(d.id);
      toast.success('Packed — ready to post');
    } catch (error) {
      const f = fieldErrors(error);
      if (f.length) setErrors(Object.fromEntries(f.map((x) => [x.path, x.message])));
    }
  };

  // Credit is re-checked as the goods leave (Day 31). A refusal is a question for whoever holds
  // `order:creditOverride` — post anyway, with a reason — and an explanation for anyone else.
  const onPost = (creditOverrideReason?: string) =>
    post.mutate(
      { id: d.id, body: creditOverrideReason ? { creditOverrideReason } : {} },
      {
        onSuccess: (r) => {
          setModal(null);
          toast.success(
            `${r.dispatch.docNo} posted${r.invoice ? ` — invoice ${r.invoice.docNo} raised` : ''}`,
          );
        },
        onError: (error) => {
          const details = errorDetails(error);
          if (errorCode(error) === 'CREDIT_LIMIT_EXCEEDED' && details.canOverride === true) {
            setShortfall(
              typeof details.shortfallMinor === 'number' ? details.shortfallMinor : null,
            );
            setModal('override');
            return;
          }
          setModal(null);
          toast.error(errorMessage(error), {
            description:
              errorCode(error) === 'CREDIT_LIMIT_EXCEEDED' && details.reason === 'OVER_LIMIT'
                ? 'Collect a payment first, or ask a sales manager to post it.'
                : undefined,
          });
        },
      },
    );

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Truck}
        title={d.docNo ?? (draft ? 'Pick list' : 'Packed challan')}
        description={`${d.dealerName ?? 'Dealer'} · order ${d.orderDocNo ?? '—'} · from ${d.locationName ?? '—'}`}
        actions={
          <>
            <StatusPill status={d.status} tone={d.status === 'PACKED' ? 'info' : undefined} />
            {open && (
              <Button variant="outline" onClick={printPick}>
                <Printer aria-hidden="true" />
                Pick sheet
              </Button>
            )}
            {d.docNo && (
              <Button variant="outline" onClick={printChallan}>
                <Printer aria-hidden="true" />
                Challan
              </Button>
            )}
            {invoice.data && (
              <Button variant="outline" onClick={printInvoice}>
                <FileText aria-hidden="true" />
                Invoice {invoice.data.docNo}
              </Button>
            )}
            {open && can('dispatch:cancel') && (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => setModal('cancel')}
              >
                <Ban aria-hidden="true" />
                Cancel
              </Button>
            )}
          </>
        }
      />

      {d.status === 'CANCELLED' && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          Cancelled {fmtDateTime(d.cancelledAt)} — {d.cancelReason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                {draft ? 'Pick and capture' : 'In this consignment'}
              </CardTitle>
              {order && (
                <Link to={`/sales/orders/${order.id}`} className="text-xs hover:underline">
                  Order {order.docNo} →
                </Link>
              )}
            </CardHeader>
            <CardContent>
              <PackGrid
                rows={rows}
                onChange={edit(setRows)}
                outstanding={draft ? outstanding : new Map()}
                errors={errors}
                editable={draft && canEdit}
              />
              {draft && gaps.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-xs text-warning">
                  {gaps.map((g) => (
                    <li key={g}>• {g}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {(open || d.transport || d.packages.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Transport and boxes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TransportFields
                  value={transport}
                  onChange={edit(setTransport)}
                  disabled={!canEdit}
                />
                <BoxesEditor boxes={boxes} onChange={edit(setBoxes)} disabled={!canEdit} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {open && (
            <Card>
              <CardContent className="space-y-3 pt-6 text-sm">
                {canEdit && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy || !dirty}
                    onClick={() => void save().then((ok) => ok && toast.success('Saved'))}
                  >
                    {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    Save
                  </Button>
                )}
                {draft && can('dispatch:pack') && (
                  <Button
                    className="w-full"
                    disabled={busy || gaps.length > 0}
                    onClick={() => void onPack()}
                  >
                    {pack.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
                    Packed
                  </Button>
                )}
                {d.status === 'PACKED' && can('dispatch:post') && (
                  <Button
                    className="w-full"
                    disabled={busy || dirty}
                    onClick={() => setModal('post')}
                  >
                    <Truck aria-hidden="true" />
                    Post — goods leave
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  {draft
                    ? 'Packing locks what is in the boxes. Lots and serials must be captured first.'
                    : dirty
                      ? 'Save the transport details before posting.'
                      : 'Posting takes the stock off the shelf, numbers the challan and raises the invoice — all at once.'}
                </p>
              </CardContent>
            </Card>
          )}

          {d.status === 'DISPATCHED' && can('dispatch:deliver') && <DeliveryForm d={d} />}
          {d.status === 'DELIVERED' && <ProofOfDelivery d={d} />}

          {invoice.data && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Invoice {invoice.data.docNo}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm tabular-nums">
                <Row label="Total" value={money(invoice.data.grandTotalMinor)} />
                <Row
                  label="Due"
                  value={invoice.data.dueDate ? fmtDateTime(invoice.data.dueDate) : '—'}
                />
                <Row label="Status" value={invoice.data.paymentStatus} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <OffScreen>
        <PickSheet ref={pickRef} d={d} org={org} shipTo={shipTo} />
        <ChallanDoc ref={challanRef} d={d} org={org} shipTo={shipTo} />
        {invoice.data && (
          <A4Invoice
            ref={invoiceRef}
            invoice={invoice.data}
            payments={[]}
            org={org}
            refs={[
              { label: 'Order', value: d.orderDocNo ?? '—' },
              { label: 'Challan', value: d.docNo ?? '—' },
            ]}
          />
        )}
      </OffScreen>

      {modal === 'post' && (
        <ConfirmDialog
          open
          onClose={() => setModal(null)}
          onConfirm={() => onPost()}
          pending={post.isPending}
          title="Post this challan?"
          confirmLabel="Post — goods leave"
          description={`${rows.reduce((s, r) => s + r.qtyBase, 0)} units leave ${d.locationName ?? 'the warehouse'} for ${d.dealerName}. The challan is numbered and, if the company invoices on dispatch, the invoice is raised and the dealer debited. This cannot be undone — goods that come back are a sales return.`}
        />
      )}
      {modal === 'override' && (
        <ReasonDialog
          title="Post over the credit limit?"
          description={`${d.dealerName ?? 'The dealer'} is over their credit limit${shortfall ? ` by ${money(shortfall)}` : ''} since this order was confirmed. You can let the goods go anyway — say why; the reason is kept on the order and in the audit log.`}
          confirmLabel="Override and post"
          pending={post.isPending}
          onConfirm={(reason) => onPost(reason)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'cancel' && (
        <ReasonDialog
          title="Cancel this challan?"
          description="Nothing has left the building, so nothing moves back. The order stays open for another pick."
          confirmLabel="Cancel challan"
          destructive
          pending={cancel.isPending}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: d.id, body: { reason } },
              {
                onSuccess: () => {
                  setModal(null);
                  toast.success('Challan cancelled');
                },
              },
            )
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** `YYYY-MM-DDTHH:mm` in local time — what `<input type="datetime-local">` holds. */
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function DeliveryForm({ d }: { d: DispatchPayload }) {
  const deliver = useDeliverDispatch();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [at, setAt] = useState(localNow);
  // The field shows "now" to the minute. Unless the user changes it, let the server stamp the
  // real moment: a minute-truncated default can fall seconds before the challan was posted.
  const [atEdited, setAtEdited] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () =>
    deliver.mutate(
      {
        id: d.id,
        body: {
          receivedByName: name.trim(),
          receivedPhone: phone.trim() || null,
          ...(atEdited ? { deliveredAt: new Date(at).toISOString() } : {}),
          signatureDataUrl: signature,
          note: note.trim() || null,
        },
      },
      {
        onSuccess: () => toast.success(`${d.docNo} delivered`),
        onError: (e) =>
          setErrors(Object.fromEntries(fieldErrors(e).map((f) => [f.path, f.message]))),
      },
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Confirm delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Received by</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.receivedByName)}
          />
          {errors.receivedByName && (
            <span className="text-xs text-destructive">{errors.receivedByName}</span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Phone</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">When</span>
            <Input
              type="datetime-local"
              value={at}
              max={localNow()}
              onChange={(e) => {
                setAt(e.target.value);
                setAtEdited(true);
              }}
              aria-invalid={Boolean(errors.deliveredAt)}
            />
          </label>
        </div>
        {errors.deliveredAt && <p className="text-xs text-destructive">{errors.deliveredAt}</p>}
        <SignaturePad onChange={setSignature} disabled={deliver.isPending} />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note — e.g. one box dented"
        />
        <Button
          className="w-full"
          disabled={name.trim().length < 2 || deliver.isPending}
          onClick={submit}
        >
          {deliver.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          Delivered
        </Button>
        <p className="text-xs text-muted-foreground">
          No signature captured? Record the name from the signed paper challan.
        </p>
      </CardContent>
    </Card>
  );
}

function ProofOfDelivery({ d }: { d: DispatchPayload }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          Delivered
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Received by" value={d.receivedByName ?? '—'} />
        {d.receivedPhone && <Row label="Phone" value={d.receivedPhone} />}
        <Row label="When" value={fmtDateTime(d.deliveredAt)} />
        {d.receivedSignatureUrl && (
          <img
            src={d.receivedSignatureUrl}
            alt={`Signature of ${d.receivedByName ?? 'the receiver'}`}
            className="w-full rounded-md border bg-white"
          />
        )}
        {d.deliveryNote && <p className="text-xs">“{d.deliveryNote}”</p>}
      </CardContent>
    </Card>
  );
}

import { BookOpen, ClipboardPen, Loader2, Plus, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { humanise } from '@/lib/utils';
import { usePermission } from '@/hooks/data/useAuth';
import {
  useAdjustments,
  useCancelAdjustment,
  useCreateAdjustment,
  useDeleteAdjustment,
  usePostAdjustment,
  useUpdateAdjustment,
} from '@/hooks/data/useStock';

import { draftsFromLines, errorMap } from './docHelpers';
import { signed } from './inventoryFormat';
import { LocationFilter } from './LocationFilter';
import { emptyLine, toLineInputs } from './stockLines';
import { StockLinesEditor } from './StockLinesEditor';

import { ADJUSTMENT_REASONS, DOCUMENT_STATUSES } from '@shared/enums';

import type { LineDraft } from './stockLines';
import type { Column } from '@/components/common/DataTable';
import type { AdjustmentReason, DocumentStatus } from '@shared/enums';
import type { StockAdjustmentPayload } from '@shared/types';

/**
 * Stock adjustments — breakage, expiry, loss, stock found.
 *
 * Draft → post. A draft moves nothing and has no number; posting allocates `ADJ-…` and writes the
 * movements. A posted adjustment is never edited: cancelling it writes the exact reverse, so the
 * ledger keeps both the mistake and its correction.
 */
export function Adjustments() {
  const navigate = useNavigate();
  const canAdjust = usePermission('stock:adjust');
  const [status, setStatus] = useState<'' | DocumentStatus>('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<{
    doc: StockAdjustmentPayload | null;
    lines: LineDraft[];
  } | null>(null);
  const [opening, setOpening] = useState(false);

  const { data, isLoading, isFetching } = useAdjustments({
    page,
    limit: 25,
    status: status || undefined,
    locationId: locationId || undefined,
  });

  const openDoc = async (doc: StockAdjustmentPayload | null) => {
    if (!doc) return setOpen({ doc: null, lines: [emptyLine()] });
    setOpening(true);
    try {
      setOpen({ doc, lines: await draftsFromLines(doc.lines) });
    } finally {
      setOpening(false);
    }
  };

  const columns: Column<StockAdjustmentPayload>[] = [
    {
      key: 'docNo',
      header: 'Adjustment',
      cell: (a) => (
        <div>
          <p className="font-mono text-sm">
            {a.docNo ?? <span className="text-muted-foreground">Draft</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(a.postedAt ?? a.createdAt).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      cell: (a) => <span className="text-sm">{a.locationName}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (a) => <span className="text-sm">{humanise(a.reason)}</span>,
    },
    { key: 'lines', header: 'Lines', className: 'tabular-nums', cell: (a) => a.lines.length },
    {
      key: 'net',
      header: 'Net units',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (a) => (
        <span className={a.netQtyBase < 0 ? 'text-destructive' : 'text-success'}>
          {signed(a.netQtyBase)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (a) => <StatusPill status={a.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Adjustments"
        icon={ClipboardPen}
        description="Reason-coded corrections to stock. Posting moves stock; cancelling reverses it."
        actions={
          canAdjust && (
            <Button onClick={() => void openDoc(null)}>
              <Plus aria-hidden="true" />
              New adjustment
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <LocationFilter
          value={locationId}
          onChange={(id) => {
            setLocationId(id);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | DocumentStatus);
            setPage(1);
          }}
          className="w-40"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>
        {opening && (
          <Loader2
            className="h-5 w-5 animate-spin self-center text-muted-foreground"
            aria-label="Opening…"
          />
        )}
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(a) => a.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(a) => void openDoc(a)}
        empty={<EmptyState icon={ClipboardPen} title="No adjustments yet" />}
      />
      {open && (
        <AdjustmentDialog
          key={open.doc?.id ?? 'new'}
          doc={open.doc}
          initialLines={open.lines}
          canAdjust={canAdjust}
          onClose={() => setOpen(null)}
          onLedger={(docNo) =>
            navigate(`/inventory/ledger?refDocNo=${encodeURIComponent(docNo)}`)
          }
        />
      )}
    </div>
  );
}

function AdjustmentDialog({
  doc,
  initialLines,
  canAdjust,
  onClose,
  onLedger,
}: {
  doc: StockAdjustmentPayload | null;
  initialLines: LineDraft[];
  canAdjust: boolean;
  onClose: () => void;
  onLedger: (docNo: string) => void;
}) {
  const editable = canAdjust && (!doc || doc.status === 'DRAFT');
  const [locationId, setLocationId] = useState(doc?.locationId ?? '');
  const [reason, setReason] = useState<AdjustmentReason>(doc?.reason ?? 'DAMAGED');
  const [note, setNote] = useState(doc?.note ?? '');
  const [lines, setLines] = useState<LineDraft[]>(initialLines);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState('');

  const create = useCreateAdjustment();
  const update = useUpdateAdjustment();
  const post = usePostAdjustment();
  const remove = useDeleteAdjustment();
  const cancel = useCancelAdjustment();
  const pending =
    create.isPending ||
    update.isPending ||
    post.isPending ||
    remove.isPending ||
    cancel.isPending;

  /** Save the draft; resolves with its id, or undefined when the server refused it. */
  const save = async (): Promise<string | undefined> => {
    setErrors({});
    const body = { locationId, reason, note: note.trim() || null, lines: toLineInputs(lines) };
    try {
      const saved = doc
        ? await update.mutateAsync({ id: doc.id, body })
        : await create.mutateAsync(body);
      return saved.id;
    } catch (e) {
      setErrors(errorMap(e));
      return undefined;
    }
  };

  const saveAndPost = async () => {
    const id = await save();
    if (!id) return;
    try {
      await post.mutateAsync(id);
      onClose();
    } catch (e) {
      // Saved as a draft; the refusal (not enough stock, a frozen item) is toasted by the client.
      setErrors(errorMap(e));
    }
  };

  const title = doc?.docNo ?? (doc ? 'Draft adjustment' : 'New adjustment');

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={title}
      description={
        doc?.status === 'POSTED'
          ? 'Posted — this moved stock. It cannot be edited; cancelling writes the exact reverse.'
          : doc?.status === 'CANCELLED'
            ? `Cancelled: ${doc.cancelReason ?? ''}`
            : 'Positive quantities add stock (found); negative ones write it off.'
      }
      size="xl"
      footer={
        <>
          {doc?.docNo && (
            <Button variant="ghost" onClick={() => onLedger(doc.docNo!)} className="mr-auto">
              <BookOpen aria-hidden="true" />
              Ledger rows
            </Button>
          )}
          {doc?.status === 'DRAFT' && canAdjust && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              disabled={pending}
              onClick={() => remove.mutate(doc.id, { onSuccess: onClose })}
            >
              <Trash2 aria-hidden="true" />
              Delete draft
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Close
          </Button>
          {editable && (
            <>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => void save().then((id) => id && onClose())}
              >
                Save draft
              </Button>
              <Button disabled={pending} onClick={() => void saveAndPost()}>
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Save &amp; post
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Location" required error={errors.locationId}>
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
          <Field label="Reason" required error={errors.reason}>
            {(props) => (
              <Select
                {...props}
                value={reason}
                onChange={(e) => setReason(e.target.value as AdjustmentReason)}
                disabled={!editable}
              >
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {humanise(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Note" error={errors.note}>
            {(props) => (
              <Input
                {...props}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!editable}
              />
            )}
          </Field>
        </div>

        <StockLinesEditor
          lines={lines}
          onChange={setLines}
          signed
          inboundLotDates
          errors={errors}
          disabled={!editable}
        />

        {doc?.status === 'POSTED' && canAdjust && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-destructive/30 p-3">
            <Field label="Reason for cancelling" className="min-w-[16rem] flex-1">
              {(props) => (
                <Input
                  {...props}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Counted wrong — the box was intact"
                />
              )}
            </Field>
            <Button
              variant="destructive"
              disabled={pending || cancelReason.trim().length < 3}
              onClick={() =>
                cancel.mutate(
                  { id: doc.id, reason: cancelReason.trim() },
                  { onSuccess: onClose },
                )
              }
            >
              <Undo2 aria-hidden="true" />
              Cancel &amp; reverse
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

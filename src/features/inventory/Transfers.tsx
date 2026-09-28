import {
  ArrowRight,
  ArrowRightLeft,
  BookOpen,
  Loader2,
  PackageCheck,
  Plus,
  Trash2,
} from 'lucide-react';
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
import { useLocations } from '@/hooks/data/useLocations';
import {
  useCreateTransfer,
  useDeleteTransfer,
  usePostTransfer,
  useReceiveTransfer,
  useTransfers,
  useUpdateTransfer,
} from '@/hooks/data/useStock';

import { draftsFromLines, errorMap } from './docHelpers';
import { LocationFilter } from './LocationFilter';
import { emptyLine, toLineInputs } from './stockLines';
import { StockLinesEditor } from './StockLinesEditor';

import { TRANSFER_STATUSES } from '@shared/enums';

import type { LineDraft } from './stockLines';
import type { Column } from '@/components/common/DataTable';
import type { TransferStatus } from '@shared/enums';
import type { StockTransferPayload } from '@shared/types';

/**
 * Stock transfers between locations — warehouse to counter, godown to shop.
 *
 * Direct: posting moves both ends in one transaction. Via a transit location: posting dispatches
 * (the goods sit in transit, on neither shop's shelf), and the receiving end confirms arrival with
 * **Receive**. The source must be one of your locations to dispatch; the destination to receive.
 */
export function Transfers() {
  const navigate = useNavigate();
  const canTransfer = usePermission('stock:transfer');
  const [status, setStatus] = useState<'' | TransferStatus>('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<{
    doc: StockTransferPayload | null;
    lines: LineDraft[];
  } | null>(null);
  const [opening, setOpening] = useState(false);

  const { data, isLoading, isFetching } = useTransfers({
    page,
    limit: 25,
    status: status || undefined,
    locationId: locationId || undefined,
  });

  const openDoc = async (doc: StockTransferPayload | null) => {
    if (!doc) return setOpen({ doc: null, lines: [emptyLine()] });
    setOpening(true);
    try {
      setOpen({ doc, lines: await draftsFromLines(doc.lines) });
    } finally {
      setOpening(false);
    }
  };

  const columns: Column<StockTransferPayload>[] = [
    {
      key: 'docNo',
      header: 'Transfer',
      cell: (t) => (
        <div>
          <p className="font-mono text-sm">
            {t.docNo ?? <span className="text-muted-foreground">Draft</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(t.dispatchedAt ?? t.createdAt).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      cell: (t) => (
        <span className="flex flex-wrap items-center gap-1 text-sm">
          {t.fromLocationName}
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="to" />
          {t.transitLocationName && (
            <>
              <span className="text-muted-foreground">{t.transitLocationName}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="to" />
            </>
          )}
          {t.toLocationName}
        </span>
      ),
    },
    { key: 'lines', header: 'Lines', className: 'tabular-nums', cell: (t) => t.lines.length },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => (
        <StatusPill
          status={t.status}
          tone={
            t.status === 'IN_TRANSIT'
              ? 'warning'
              : t.status === 'RECEIVED'
                ? 'success'
                : undefined
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transfers"
        icon={ArrowRightLeft}
        description="Move stock between locations. Both ends move together, or via transit with a receive step."
        actions={
          canTransfer && (
            <Button onClick={() => void openDoc(null)}>
              <Plus aria-hidden="true" />
              New transfer
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
          allLabel="Any of my locations"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | TransferStatus);
            setPage(1);
          }}
          className="w-40"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {TRANSFER_STATUSES.map((s) => (
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
        rowKey={(t) => t.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(t) => void openDoc(t)}
        empty={<EmptyState icon={ArrowRightLeft} title="No transfers yet" />}
      />
      {open && (
        <TransferDialog
          key={open.doc?.id ?? 'new'}
          doc={open.doc}
          initialLines={open.lines}
          canTransfer={canTransfer}
          onClose={() => setOpen(null)}
          onLedger={(docNo) =>
            navigate(`/inventory/ledger?refDocNo=${encodeURIComponent(docNo)}`)
          }
        />
      )}
    </div>
  );
}

function TransferDialog({
  doc,
  initialLines,
  canTransfer,
  onClose,
  onLedger,
}: {
  doc: StockTransferPayload | null;
  initialLines: LineDraft[];
  canTransfer: boolean;
  onClose: () => void;
  onLedger: (docNo: string) => void;
}) {
  const editable = canTransfer && (!doc || doc.status === 'DRAFT');
  // Every active location, not just the caller's: a transfer is routinely sent to a shop the
  // sender does not run. The server checks access to the source only.
  const { data: all } = useLocations({ limit: 200, isActive: true });
  const locations = all?.items ?? [];

  const [fromLocationId, setFrom] = useState(doc?.fromLocationId ?? '');
  const [toLocationId, setTo] = useState(doc?.toLocationId ?? '');
  const [transitLocationId, setTransit] = useState(doc?.transitLocationId ?? '');
  const [note, setNote] = useState(doc?.note ?? '');
  const [lines, setLines] = useState<LineDraft[]>(initialLines);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useCreateTransfer();
  const update = useUpdateTransfer();
  const post = usePostTransfer();
  const receive = useReceiveTransfer();
  const remove = useDeleteTransfer();
  const pending =
    create.isPending ||
    update.isPending ||
    post.isPending ||
    receive.isPending ||
    remove.isPending;

  const save = async (): Promise<string | undefined> => {
    setErrors({});
    const body = {
      fromLocationId,
      toLocationId,
      transitLocationId: transitLocationId || null,
      note: note.trim() || null,
      lines: toLineInputs(lines),
    };
    try {
      return (
        doc ? await update.mutateAsync({ id: doc.id, body }) : await create.mutateAsync(body)
      ).id;
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
      setErrors(errorMap(e));
    }
  };

  const stockLocations = locations.filter((l) => l.type !== 'TRANSIT');
  const transits = locations.filter((l) => l.type === 'TRANSIT');

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={doc?.docNo ?? (doc ? 'Draft transfer' : 'New transfer')}
      description={
        doc?.status === 'IN_TRANSIT'
          ? 'On its way — the goods are in transit. Receive them at the destination when they arrive.'
          : doc?.status === 'RECEIVED'
            ? 'Received — both ends have moved.'
            : 'Serials and lots travel with the goods: name them on each line.'
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
          {doc?.status === 'DRAFT' && canTransfer && (
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
                {transitLocationId ? 'Save & dispatch' : 'Save & post'}
              </Button>
            </>
          )}
          {doc?.status === 'IN_TRANSIT' && canTransfer && (
            <Button
              disabled={pending}
              onClick={() => receive.mutate(doc.id, { onSuccess: onClose })}
            >
              <PackageCheck aria-hidden="true" />
              Receive at {doc.toLocationName}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="From"
            required
            error={errors.fromLocationId}
            hint="One of your locations."
          >
            {() => (
              <LocationFilter
                value={fromLocationId}
                onChange={setFrom}
                includeAll={false}
                excludeTransit
                className="w-full"
              />
            )}
          </Field>
          <Field label="To" required error={errors.toLocationId}>
            {(props) => (
              <Select
                {...props}
                value={toLocationId}
                onChange={(e) => setTo(e.target.value)}
                disabled={!editable}
              >
                <option value="">Choose…</option>
                {stockLocations
                  .filter((l) => l.id !== fromLocationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field
            label="Via transit"
            error={errors.transitLocationId}
            hint={transits.length ? 'Optional.' : 'No transit location set up.'}
          >
            {(props) => (
              <Select
                {...props}
                value={transitLocationId}
                onChange={(e) => setTransit(e.target.value)}
                disabled={!editable || transits.length === 0}
              >
                <option value="">Direct</option>
                {transits.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
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
          signed={false}
          inboundLotDates={false}
          errors={errors}
          disabled={!editable}
        />
      </div>
    </Dialog>
  );
}

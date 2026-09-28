import { ClipboardCheck, Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductPicker } from '@/components/common/ProductPicker';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { humanise } from '@/lib/utils';
import { usePermission } from '@/hooks/data/useAuth';
import { useCounts, useOpenCount } from '@/hooks/data/useStock';

import { errorMap } from './docHelpers';
import { signed } from './inventoryFormat';
import { LocationFilter } from './LocationFilter';

import { COUNT_STATUSES } from '@shared/enums';

import type { Column } from '@/components/common/DataTable';
import type { CountStatus } from '@shared/enums';
import type { ProductPayload, StockCountPayload } from '@shared/types';

/**
 * Stock counts. Opening one **freezes** what it covers — nothing moves those items at that
 * location until the count is posted or cancelled — so the sheet describes a shelf that is not
 * changing under the counters. Posting writes only the variances.
 */
export function Counts() {
  const navigate = useNavigate();
  const canCount = usePermission('stock:count');
  const [status, setStatus] = useState<'' | CountStatus>('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState(false);

  const { data, isLoading, isFetching } = useCounts({
    page,
    limit: 25,
    status: status || undefined,
    locationId: locationId || undefined,
  });

  const columns: Column<StockCountPayload>[] = [
    {
      key: 'docNo',
      header: 'Count',
      cell: (c) => (
        <div>
          <p className="font-mono text-sm">
            {c.docNo ?? <span className="text-muted-foreground">In progress</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            Frozen {new Date(c.frozenAt).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      cell: (c) => <span className="text-sm">{c.locationName}</span>,
    },
    {
      key: 'scope',
      header: 'Scope',
      cell: (c) => (
        <span className="text-sm">
          {c.scope === 'ALL' ? 'Whole location' : `${c.lines.length} item(s)`}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Counted',
      className: 'tabular-nums',
      cell: (c) => `${c.summary.counted} / ${c.summary.lines}`,
    },
    {
      key: 'variance',
      header: 'Variance',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (c) =>
        c.summary.withVariance ? (
          <span className={c.summary.netVarianceBase < 0 ? 'text-destructive' : 'text-success'}>
            {c.summary.withVariance} line(s), net {signed(c.summary.netVarianceBase)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <StatusPill
          status={c.status}
          tone={
            c.status === 'COUNTING' ? 'warning' : c.status === 'POSTED' ? 'success' : undefined
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock counts"
        icon={ClipboardCheck}
        description="Freeze, count, post the variance. Lot- and serial-tracked items are counted by lot or serial, not here."
        actions={
          canCount && (
            <Button onClick={() => setOpening(true)}>
              <Plus aria-hidden="true" />
              Open a count
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
            setStatus(e.target.value as '' | CountStatus);
            setPage(1);
          }}
          className="w-40"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {COUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(c) => navigate(`/inventory/counts/${c.id}`)}
        empty={<EmptyState icon={ClipboardCheck} title="No counts yet" />}
      />
      {opening && (
        <OpenCountDialog
          onClose={() => setOpening(false)}
          onOpened={(id) => navigate(`/inventory/counts/${id}`)}
        />
      )}
    </div>
  );
}

function OpenCountDialog({
  onClose,
  onOpened,
}: {
  onClose: () => void;
  onOpened: (id: string) => void;
}) {
  const open = useOpenCount();
  const [locationId, setLocationId] = useState('');
  const [scope, setScope] = useState<'ALL' | 'PRODUCTS'>('PRODUCTS');
  const [products, setProducts] = useState<ProductPayload[]>([]);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () =>
    open.mutate(
      {
        locationId,
        scope,
        ...(scope === 'PRODUCTS' ? { productIds: products.map((p) => p.id) } : {}),
        note: note.trim() || null,
      },
      { onSuccess: (c) => onOpened(c.id), onError: (e) => setErrors(errorMap(e)) },
    );

  return (
    <Dialog
      open
      onClose={open.isPending ? () => undefined : onClose}
      title="Open a stock count"
      description="Opening freezes the items: no sale, transfer or adjustment can move them here until the count is posted or cancelled."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={open.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              open.isPending || !locationId || (scope === 'PRODUCTS' && products.length === 0)
            }
          >
            {open.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Freeze &amp; start counting
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field label="What to count" error={errors.scope}>
            {(props) => (
              <Select
                {...props}
                value={scope}
                onChange={(e) => setScope(e.target.value as 'ALL' | 'PRODUCTS')}
              >
                <option value="PRODUCTS">Chosen products (a cycle count)</option>
                <option value="ALL">Everything at the location</option>
              </Select>
            )}
          </Field>
        </div>
        {scope === 'ALL' && (
          <p
            role="status"
            className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm"
          >
            Everything at this location will be frozen until the count is posted or cancelled —
            including the counter, if you choose it. Plan a whole-location count for a closed
            day.
          </p>
        )}
        {scope === 'PRODUCTS' && (
          <Field
            label="Products"
            error={errors.productIds}
            hint="Lot- and serial-tracked products are counted separately."
          >
            {() => (
              <div className="space-y-2">
                <ProductPicker
                  value={null}
                  onChange={(p) =>
                    p && !products.some((x) => x.id === p.id) && setProducts([...products, p])
                  }
                  placeholder="Add a product…"
                />
                <div className="flex flex-wrap gap-1.5">
                  {products.map((p) => (
                    <Badge key={p.id} variant="secondary" className="gap-1">
                      {p.sku}
                      {p.trackingMode !== 'NONE' && (
                        <span className="text-destructive">
                          ({p.trackingMode.toLowerCase()})
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${p.sku}`}
                        onClick={() => setProducts(products.filter((x) => x.id !== p.id))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Field>
        )}
        <Field label="Note" error={errors.note}>
          {(props) => (
            <Input
              {...props}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Monthly cycle count — aisle 3"
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

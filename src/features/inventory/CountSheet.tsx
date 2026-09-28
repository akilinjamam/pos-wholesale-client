import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  Loader2,
  Plus,
  Save,
  Snowflake,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductPicker } from '@/components/common/ProductPicker';
import { StatusPill } from '@/components/common/StatusPill';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/data/useAuth';
import { useCancelCount, useCount, usePostCount, useRecordCount } from '@/hooks/data/useStock';
import { useVariants } from '@/hooks/data/useVariants';

import { signed } from './inventoryFormat';

import type { ProductPayload } from '@shared/types';

/**
 * The count sheet: expected (frozen) quantities, what the counters found, and the variance.
 *
 * Counts are entered in base units and saved in batches — as each aisle is finished — so a
 * dropped connection loses one aisle at most. A found item not on the sheet can be added. Posting
 * writes a `COUNT` movement for each non-zero variance only, then lifts the freeze.
 */
const lineKey = (productId: string, variantId: string | null) =>
  `${productId}|${variantId ?? ''}`;

export function CountSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canCount = usePermission('stock:count');
  const { data: count, isLoading } = useCount(id);

  const record = useRecordCount();
  const post = usePostCount();
  const cancel = useCancelCount();

  /** Unsaved figures, by line — what the counter has typed since the last save. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [skipUncounted, setSkipUncounted] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [found, setFound] = useState<{
    product: ProductPayload | null;
    variantId: string;
    qty: string;
  }>({ product: null, variantId: '', qty: '' });
  const { data: foundVariants } = useVariants(
    { productId: found.product?.id ?? '', limit: 200 },
    Boolean(found.product?.hasVariants),
  );

  const counting = count?.status === 'COUNTING' && canCount;

  const dirty = useMemo(
    () =>
      Object.entries(typed).filter(
        ([, v]) => v.trim() !== '' && Number.isInteger(Number(v)) && Number(v) >= 0,
      ),
    [typed],
  );

  if (isLoading) return <Skeleton className="h-96" />;
  if (!count) return <EmptyState icon={ClipboardCheck} title="Count not found" />;

  const save = () =>
    record.mutate(
      {
        id: count.id,
        body: {
          lines: dirty.map(([key, v]) => {
            const [productId, variantId] = key.split('|');
            return {
              productId: productId!,
              variantId: variantId || null,
              countedQty: Number(v),
            };
          }),
        },
      },
      { onSuccess: () => setTyped({}) },
    );

  const addFound = () =>
    found.product &&
    record.mutate(
      {
        id: count.id,
        body: {
          lines: [
            {
              productId: found.product.id,
              variantId: found.variantId || null,
              countedQty: Number(found.qty),
            },
          ],
        },
      },
      { onSuccess: () => setFound({ product: null, variantId: '', qty: '' }) },
    );

  const uncounted = count.summary.lines - count.summary.counted;

  return (
    <div className="space-y-5">
      <Link
        to="/inventory/counts"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2')}
      >
        <ArrowLeft aria-hidden="true" />
        Counts
      </Link>
      <PageHeader
        title={count.docNo ?? `Count at ${count.locationName}`}
        icon={ClipboardCheck}
        description={`${count.scope === 'ALL' ? 'Whole location' : 'Chosen products'} · frozen ${new Date(count.frozenAt).toLocaleString()}${count.note ? ` · ${count.note}` : ''}`}
        actions={
          <>
            {count.docNo && (
              <Button
                variant="outline"
                onClick={() =>
                  navigate(`/inventory/ledger?refDocNo=${encodeURIComponent(count.docNo!)}`)
                }
              >
                <BookOpen aria-hidden="true" />
                Ledger rows
              </Button>
            )}
            {counting && (
              <>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel count
                </Button>
                <Button
                  variant="outline"
                  onClick={save}
                  disabled={dirty.length === 0 || record.isPending}
                >
                  {record.isPending ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save aria-hidden="true" />
                  )}
                  Save {dirty.length || ''} figure(s)
                </Button>
                <Button
                  onClick={() => setConfirmPost(true)}
                  disabled={dirty.length > 0 || post.isPending}
                  title={dirty.length ? 'Save your figures first' : undefined}
                >
                  Post count
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          [
            'Status',
            <StatusPill
              key="s"
              status={count.status}
              tone={
                count.status === 'COUNTING'
                  ? 'warning'
                  : count.status === 'POSTED'
                    ? 'success'
                    : undefined
              }
            />,
          ],
          ['Counted', `${count.summary.counted} / ${count.summary.lines}`],
          ['Lines with variance', String(count.summary.withVariance)],
          ['Net variance', signed(count.summary.netVarianceBase)],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <div className="text-lg font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {count.status === 'COUNTING' && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Snowflake className="h-4 w-4" aria-hidden="true" />
          These items are frozen at {count.locationName}: nothing can move them until this count
          is posted or cancelled.
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="w-40 text-right">Counted</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {count.lines.map((l) => {
              const key = lineKey(l.productId, l.variantId);
              const draft = typed[key];
              const shown = draft !== undefined && draft !== '' ? Number(draft) : l.countedBase;
              const variance =
                shown === null || Number.isNaN(shown) ? null : shown - l.expectedBase;
              return (
                <TableRow
                  key={key}
                  className={draft !== undefined ? 'bg-warning/5' : undefined}
                >
                  <TableCell>
                    <p className="font-medium">{l.productName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {l.sku}
                      {l.variantLabel && ` · ${l.variantLabel}`}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.expectedBase}{' '}
                    <span className="text-xs text-muted-foreground">{l.baseUom}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {counting ? (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={draft ?? l.countedBase ?? ''}
                        onChange={(e) => setTyped({ ...typed, [key]: e.target.value })}
                        className="ml-auto h-9 w-28 text-right tabular-nums"
                        aria-label={`Counted ${l.sku}`}
                        placeholder="—"
                      />
                    ) : (
                      <span className="tabular-nums">{l.countedBase ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium tabular-nums',
                      variance === null
                        ? 'text-muted-foreground'
                        : variance < 0
                          ? 'text-destructive'
                          : variance > 0
                            ? 'text-success'
                            : 'text-muted-foreground',
                    )}
                  >
                    {variance === null
                      ? 'not counted'
                      : variance === 0
                        ? 'matches'
                        : signed(variance)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {counting && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">Found something not on the sheet?</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-72">
                <ProductPicker
                  value={found.product}
                  onChange={(p) => setFound({ product: p, variantId: '', qty: found.qty })}
                />
              </div>
              {found.product?.hasVariants && (
                <Select
                  value={found.variantId}
                  onChange={(e) => setFound({ ...found, variantId: e.target.value })}
                  className="w-48"
                  aria-label="Variant"
                >
                  <option value="">Choose variant…</option>
                  {(foundVariants?.items ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              )}
              <Input
                type="number"
                min={0}
                value={found.qty}
                onChange={(e) => setFound({ ...found, qty: e.target.value })}
                placeholder="Qty found"
                className="w-28"
                aria-label="Quantity found"
              />
              <Button
                variant="outline"
                onClick={addFound}
                disabled={!found.product || found.qty === '' || record.isPending}
              >
                <Plus aria-hidden="true" />
                Add to count
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={() =>
          post.mutate(
            { id: count.id, body: { skipUncounted } },
            { onSuccess: () => setConfirmPost(false), onError: () => setConfirmPost(false) },
          )
        }
        title="Post this count?"
        description={
          <div className="space-y-3">
            <p>
              {count.summary.withVariance === 0
                ? 'Every counted line matches — posting records the count and moves no stock.'
                : `${count.summary.withVariance} line(s) differ; posting moves stock by exactly those differences (net ${signed(count.summary.netVarianceBase)}). Lines that match move nothing.`}{' '}
              The freeze is lifted.
            </p>
            {uncounted > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={skipUncounted}
                  onChange={() => setSkipUncounted(!skipUncounted)}
                />
                <span>
                  {uncounted} line(s) are not counted. Post anyway and leave them as the system
                  has them. (Otherwise the post is refused — an uncounted line is usually a
                  missed shelf.)
                </span>
              </label>
            )}
          </div>
        }
        confirmLabel="Post count"
        pending={post.isPending}
      />
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancel.mutate(count.id, { onSuccess: () => setConfirmCancel(false) })}
        title="Cancel this count?"
        description="Nothing is posted; the figures entered are kept on the cancelled count for reference, and the items are unfrozen."
        confirmLabel="Cancel count"
        destructive
        pending={cancel.isPending}
      />
    </div>
  );
}

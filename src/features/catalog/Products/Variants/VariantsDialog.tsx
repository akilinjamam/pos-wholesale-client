import { Layers, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { errorMessage, fieldErrors } from '@/api/client';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/hooks/data/useAuth';
import { useCreateVariant, useDeleteVariant, useVariants } from '@/hooks/data/useVariants';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { GeneratePanel } from './GeneratePanel';

import type { Column, SortState } from '@/components/common/DataTable';
import type { ProductPayload, VariantPayload } from '@shared/types';
import type { VariantAxisValues } from '@shared/variant';

/**
 * A product's variants: what exists, plus the two ways to make more.
 *
 * The list is deliberately of *existing* variants, not of the declared grid. A lens declaring
 * sph −10..+8 has 73 legal powers and may stock four of them; showing all 73 as rows would
 * imply they exist. The grid's job is to bound what may be created — it is stated in the
 * generate panel, where it is the constraint being applied.
 *
 * Rendered as a dialog rather than a tab on a product page: the product editor is itself a
 * dialog, and this is the same "one product, one focused task" shape. A real detail page with
 * tabs arrives with the dealer profile on Day 10, and this moves onto it then.
 */

interface VariantsDialogProps {
  open: boolean;
  onClose: () => void;
  product: ProductPayload | null;
}

export function VariantsDialog({ open, onClose, product }: VariantsDialogProps) {
  const canManage = usePermission('variant:manage');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ field: 'variantKey', order: 'asc' });
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);

  const q = useDebouncedValue(search);
  const deleteVariant = useDeleteVariant();

  const { data, isLoading, isFetching } = useVariants(
    {
      productId: product?.id ?? '',
      page,
      limit: 50,
      q: q || undefined,
      sort: sort.field,
      order: sort.order,
    },
    // No product means no dialog; the query must not fire with an empty id.
    Boolean(product),
  );

  if (!product) return null;

  const columns: Column<VariantPayload>[] = [
    {
      key: 'label',
      header: 'Variant',
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{v.label}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{v.variantKey}</p>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      cell: (v) => <span className="font-mono text-xs">{v.sku}</span>,
    },
    {
      key: 'barcode',
      header: 'Barcode',
      cell: (v) => (
        <span className="font-mono text-xs">
          {v.barcode ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (v) => <StatusPill status={v.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'text-right',
            headClassName: 'text-right',
            cell: (v: VariantPayload) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => deleteVariant.mutate(v.id)}
                disabled={deleteVariant.isPending}
                aria-label={`Remove ${v.label}`}
                title="Remove"
              >
                <Trash2 />
              </Button>
            ),
          },
        ]
      : []),
  ];

  const total = data?.meta.total ?? 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Variants — ${product.name}`}
      description={`Varies by ${product.variantAxes.join(' and ')}. Variants are created when you generate them or when stock is first received.`}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search SKU, key or barcode…"
              className="pl-9"
              aria-label="Search variants"
            />
          </div>

          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdding((v) => !v);
                  setGenerating(false);
                }}
              >
                <Plus aria-hidden="true" />
                Add one
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setGenerating((v) => !v);
                  setAdding(false);
                }}
              >
                <Sparkles aria-hidden="true" />
                Generate range
              </Button>
            </>
          )}
        </div>

        {/* Inline rather than a nested dialog: two stacked modals would share a document-level
            Escape handler, and one key press would close both. */}
        {generating && <GeneratePanel product={product} onDone={() => setGenerating(false)} />}
        {adding && <ManualAdd product={product} onDone={() => setAdding(false)} />}

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(v) => v.id}
          isLoading={isLoading}
          isFetching={isFetching}
          meta={data?.meta}
          onPageChange={setPage}
          sort={sort}
          onSortChange={setSort}
          skeletonRows={5}
          empty={
            q ? (
              <EmptyState icon={Search} title={`No variant matches “${q}”`} />
            ) : (
              <EmptyState
                icon={Layers}
                title="No variants yet"
                description="Generate the range you stock, or let them appear as stock is received."
              />
            )
          }
        />

        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString('en-US')} variant{total === 1 ? '' : 's'} exist. Stock is held
            per variant from day 13.
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Add a single variant by hand.
 *
 * Needed alongside the generator for the one-off: a lens stocked at a single odd power, or a
 * frame colour that arrived outside the usual range. The axes offered are exactly the ones the
 * product declares, and the server checks them against the grid regardless.
 */
function ManualAdd({ product, onDone }: { product: ProductPayload; onDone: () => void }) {
  const createVariant = useCreateVariant();
  const [values, setValues] = useState<Record<string, string>>({});

  const set = (axis: string, value: string) =>
    setValues((current) => ({ ...current, [axis]: value }));

  const onAdd = () => {
    const axes: VariantAxisValues = {};

    for (const axis of product.variantAxes) {
      const raw = (values[axis] ?? '').trim();
      if (raw === '') continue;

      if (axis === 'color' || axis === 'size') axes[axis] = raw;
      else {
        const n = Number(raw);
        if (Number.isFinite(n)) axes[axis] = n;
      }
    }

    createVariant.mutate(
      { productId: product.id, axes },
      {
        onSuccess: () => {
          setValues({});
          onDone();
        },
        onError: (error) => {
          const fields = fieldErrors(error);
          toast.error(fields[0]?.message ?? errorMessage(error));
        },
      },
    );
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">Add one variant</p>

      <div className="flex flex-wrap items-end gap-3">
        {product.variantAxes.map((axis) => (
          <label key={axis} className="space-y-1">
            <span className="block text-xs font-medium capitalize">{axis}</span>
            <Input
              value={values[axis] ?? ''}
              onChange={(e) => set(axis, e.target.value)}
              type={axis === 'color' || axis === 'size' ? 'text' : 'number'}
              step={axis === 'axis' ? '1' : '0.25'}
              className="w-28"
              placeholder={axis === 'color' ? 'Black' : axis === 'size' ? '52' : '-2.00'}
            />
          </label>
        ))}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDone}
            disabled={createVariant.isPending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={onAdd} disabled={createVariant.isPending}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

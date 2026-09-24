import { Ban, Layers, Package, Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { env } from '@/config/env';
import { humanise } from '@/lib/utils';
import { usePermission } from '@/hooks/data/useAuth';
import { useBrands } from '@/hooks/data/useBrands';
import { useCategories } from '@/hooks/data/useCategories';
import { useDeactivateProduct, useProducts } from '@/hooks/data/useProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { ProductEditor } from './ProductEditor';
import { VariantsDialog } from './Variants/VariantsDialog';

import { formatMoney } from '@shared/money';
import { PRODUCT_TYPES } from '@shared/enums';

import type { Column, SortState } from '@/components/common/DataTable';
import type { ProductType } from '@shared/enums';
import type { ProductPayload } from '@shared/types';

/**
 * The catalogue.
 *
 * One list for all five product types, filtered rather than split into five screens — which is
 * the whole argument for the single `Product` collection. A buyer asking "what do we carry from
 * this brand" does not care whether the answer is frames or lenses.
 *
 * The **stock status** filter the work plan lists is deliberately absent: stock does not exist
 * until Day 13, and a filter that silently matches everything is worse than one that is not
 * there. It joins this toolbar on Day 16, with the Stock-on-Hand screen behind it.
 */
export function ProductsList() {
  const canCreate = usePermission('product:create');
  const canUpdate = usePermission('product:update');
  const canDelete = usePermission('product:delete');
  const canViewCost = usePermission('stock:viewCost');

  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | ProductType>('');
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortState>({ field: 'name', order: 'asc' });

  const [editing, setEditing] = useState<ProductPayload | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  /** The editor's `key`, bumped per open — see the longer note in `RolesList`. */
  const [editorSession, setEditorSession] = useState(0);
  const [deactivating, setDeactivating] = useState<ProductPayload | null>(null);
  const [variantsOf, setVariantsOf] = useState<ProductPayload | null>(null);

  const q = useDebouncedValue(search);
  const deactivateProduct = useDeactivateProduct();

  const { data: brands } = useBrands({ limit: 200 });
  const { data: categories } = useCategories({ limit: 200 });

  const { data, isLoading, isFetching } = useProducts({
    page,
    limit,
    q: q || undefined,
    sort: sort.field,
    order: sort.order,
    type: type || undefined,
    brandId: brandId || undefined,
    // The subtree, not just the exact node: picking "Frames" should include everything under it.
    categoryUnder: categoryId || undefined,
    isActive: activeFilter === '' ? undefined : activeFilter === 'true',
  });

  const openEditor = (product: ProductPayload | null) => {
    setEditing(product);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  };

  const resetPage = () => setPage(1);

  const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });

  const columns: Column<ProductPayload>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{p.sku}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      cell: (p) => <StatusPill status={p.type} tone="info" />,
    },
    {
      key: 'brandName',
      header: 'Brand',
      cell: (p) => (
        <span className="text-sm">
          {p.brandName ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: 'categoryName',
      header: 'Category',
      cell: (p) => (
        <span className="text-sm">
          {p.categoryName ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: 'defaultSellPriceMinor',
      header: 'Sell price',
      sortable: true,
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (p) => money(p.defaultSellPriceMinor),
    },
    // Present only for `stock:viewCost` — the field is absent from the payload otherwise, so
    // there is nothing to render even if the column were drawn.
    ...(canViewCost
      ? [
          {
            key: 'standardCostMinor',
            header: 'Cost',
            className: 'text-right tabular-nums text-muted-foreground',
            headClassName: 'text-right',
            cell: (p: ProductPayload) =>
              p.standardCostMinor === undefined ? '—' : money(p.standardCostMinor),
          },
        ]
      : []),
    {
      key: 'flags',
      header: 'Tracking',
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.trackingMode !== 'NONE' && (
            <Badge variant="outline">{humanise(p.trackingMode)}</Badge>
          )}
          {p.hasVariants && <Badge variant="secondary">variants</Badge>}
          {p.trackingMode === 'NONE' && !p.hasVariants && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (p) => <StatusPill status={p.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Only where there is something to manage — a product without axes has no
              variants, and an always-present button would imply otherwise. */}
          {p.hasVariants && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setVariantsOf(p)}
              aria-label={`Variants of ${p.name}`}
              title="Variants"
            >
              <Layers />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openEditor(p)}
            aria-label={canUpdate ? `Edit ${p.name}` : `View ${p.name}`}
            title={canUpdate ? 'Edit' : 'View'}
          >
            <Pencil />
          </Button>

          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              disabled={!p.isActive}
              title={p.isActive ? 'Deactivate' : 'Already deactivated'}
              onClick={() => setDeactivating(p)}
              aria-label={`Deactivate ${p.name}`}
            >
              <Ban />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const filtered = Boolean(q || type || brandId || categoryId || activeFilter);

  const clearFilters = () => {
    setSearch('');
    setType('');
    setBrandId('');
    setCategoryId('');
    setActiveFilter('');
    resetPage();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        icon={Package}
        description="Frames, sunglasses, lenses, accessories and machines — one catalogue."
        actions={
          canCreate && (
            <Button onClick={() => openEditor(null)}>
              <Plus aria-hidden="true" />
              New product
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search name, SKU or barcode…"
            className="pl-9"
            aria-label="Search products"
          />
        </div>

        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value as '' | ProductType);
            resetPage();
          }}
          className="w-36"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanise(t)}
            </option>
          ))}
        </Select>

        <Select
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            resetPage();
          }}
          className="w-40"
          aria-label="Filter by brand"
        >
          <option value="">All brands</option>
          {(brands?.items ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>

        <Select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            resetPage();
          }}
          className="w-48"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {(categories?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.breadcrumb.join(' › ')}
            </option>
          ))}
        </Select>

        <Select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value as '' | 'true' | 'false');
            resetPage();
          }}
          className="w-36"
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next);
          resetPage();
        }}
        sort={sort}
        onSortChange={setSort}
        onRowClick={openEditor}
        empty={
          filtered ? (
            <EmptyState
              icon={Search}
              title="No product matches these filters"
              description="Nothing is wrong — the filters simply exclude everything."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Package}
              title="The catalogue is empty"
              description="Add your first product. Brands and categories are optional, but make the list far easier to work with later."
              action={
                canCreate && (
                  <Button size="sm" onClick={() => openEditor(null)}>
                    <Plus aria-hidden="true" />
                    New product
                  </Button>
                )
              }
            />
          )
        }
      />

      <ProductEditor
        key={editorSession}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        product={editing}
      />

      <VariantsDialog
        key={variantsOf?.id ?? 'none'}
        open={variantsOf !== null}
        onClose={() => setVariantsOf(null)}
        product={variantsOf}
      />

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() =>
          deactivating &&
          deactivateProduct.mutate(deactivating.id, { onSuccess: () => setDeactivating(null) })
        }
        title="Deactivate this product?"
        description={
          <>
            <strong>{deactivating?.name}</strong> will disappear from order and counter pickers.
            It is not deleted: invoice lines, stock ledger rows and price list entries all point
            at it, and history has to keep resolving. You can reactivate it later.
          </>
        }
        confirmLabel="Deactivate"
        destructive
        pending={deactivateProduct.isPending}
      />
    </div>
  );
}

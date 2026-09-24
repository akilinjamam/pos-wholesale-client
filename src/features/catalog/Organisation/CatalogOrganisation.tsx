import { FolderTree, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePermission } from '@/hooks/data/useAuth';
import { useBrands, useDeleteBrand } from '@/hooks/data/useBrands';
import { useCategories, useDeleteCategory } from '@/hooks/data/useCategories';

import { BrandEditor } from './BrandEditor';
import { CategoryEditor } from './CategoryEditor';

import type { Column } from '@/components/common/DataTable';
import type { BrandPayload, CategoryPayload } from '@shared/types';

/**
 * Brands and categories — the two lists a product is filed under.
 *
 * One screen rather than two, because they are small, they are almost always edited together
 * when setting the catalogue up, and neither is substantial enough to earn a sidebar entry of
 * its own. Both lists are short by nature (tens of rows), so they are shown unpaginated at the
 * API's ceiling rather than with a pager that would never be used.
 *
 * Deleting differs from the rest of the app on purpose: a brand or category carries no history,
 * so it is genuinely removed — but only while nothing references it. The server refuses
 * otherwise, and the buttons say why before the click.
 */
export function CatalogOrganisation() {
  const canManageBrands = usePermission('brand:manage');
  const canManageCategories = usePermission('category:manage');

  const [brand, setBrand] = useState<BrandPayload | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [category, setCategory] = useState<CategoryPayload | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  /** One counter for both dialogs — see the note on `dialogSession` in `UsersList`. */
  const [session, setSession] = useState(0);

  const [deletingBrand, setDeletingBrand] = useState<BrandPayload | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<CategoryPayload | null>(null);

  const brands = useBrands({ limit: 200 });
  const categories = useCategories({ limit: 200 });
  const deleteBrand = useDeleteBrand();
  const deleteCategory = useDeleteCategory();

  const openBrand = (value: BrandPayload | null) => {
    setBrand(value);
    setSession((n) => n + 1);
    setBrandOpen(true);
  };

  const openCategory = (value: CategoryPayload | null) => {
    setCategory(value);
    setSession((n) => n + 1);
    setCategoryOpen(true);
  };

  const brandColumns: Column<BrandPayload>[] = [
    {
      key: 'name',
      header: 'Brand',
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{b.slug}</p>
        </div>
      ),
    },
    {
      key: 'productCount',
      header: 'Products',
      className: 'tabular-nums',
      cell: (b) => b.productCount ?? 0,
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (b) => <StatusPill status={b.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (b) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openBrand(b)}
            aria-label={`Edit ${b.name}`}
          >
            <Pencil />
          </Button>
          {canManageBrands && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              disabled={(b.productCount ?? 0) > 0}
              title={
                (b.productCount ?? 0) > 0
                  ? 'Products still carry this brand — deactivate it instead'
                  : 'Delete'
              }
              onClick={() => setDeletingBrand(b)}
              aria-label={`Delete ${b.name}`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const categoryColumns: Column<CategoryPayload>[] = [
    {
      key: 'name',
      header: 'Category',
      cell: (c) => (
        // Indented by depth, so the tree is readable as a flat list without a tree widget.
        <div className="min-w-0" style={{ paddingLeft: `${c.path.length * 1.25}rem` }}>
          <p className="truncate font-medium">{c.name}</p>
          {c.path.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">
              {c.breadcrumb.slice(0, -1).join(' › ')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'productType',
      header: 'Restricted to',
      cell: (c) =>
        c.productType ? (
          <Badge variant="outline">{c.productType}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Any type</span>
        ),
    },
    {
      key: 'productCount',
      header: 'Products',
      className: 'tabular-nums',
      cell: (c) => c.productCount ?? 0,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (c) => {
        const blocked = (c.childCount ?? 0) > 0 || (c.productCount ?? 0) > 0;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openCategory(c)}
              aria-label={`Edit ${c.name}`}
            >
              <Pencil />
            </Button>
            {canManageCategories && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                disabled={blocked}
                title={
                  (c.childCount ?? 0) > 0
                    ? 'Move or delete its sub-categories first'
                    : (c.productCount ?? 0) > 0
                      ? 'Products are still filed here'
                      : 'Delete'
                }
                onClick={() => setDeletingCategory(c)}
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Brands & categories"
        icon={FolderTree}
        description="The labels and the tree that products are filed under."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4" aria-hidden="true" />
                Brands
              </CardTitle>
              <CardDescription>
                The name on the product, not who you buy it from.
              </CardDescription>
            </div>
            {canManageBrands && (
              <Button size="sm" onClick={() => openBrand(null)}>
                <Plus aria-hidden="true" />
                New
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <DataTable
              columns={brandColumns}
              rows={brands.data?.items ?? []}
              rowKey={(b) => b.id}
              isLoading={brands.isLoading}
              isFetching={brands.isFetching}
              onRowClick={openBrand}
              skeletonRows={4}
              empty={
                <EmptyState
                  icon={Tag}
                  title="No brands yet"
                  description="Optional, but they make the catalogue far easier to filter."
                />
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderTree className="h-4 w-4" aria-hidden="true" />
                Categories
              </CardTitle>
              <CardDescription>
                Nest as deep as you like; products file at any level.
              </CardDescription>
            </div>
            {canManageCategories && (
              <Button size="sm" onClick={() => openCategory(null)}>
                <Plus aria-hidden="true" />
                New
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <DataTable
              columns={categoryColumns}
              rows={categories.data?.items ?? []}
              rowKey={(c) => c.id}
              isLoading={categories.isLoading}
              isFetching={categories.isFetching}
              onRowClick={openCategory}
              skeletonRows={4}
              empty={
                <EmptyState
                  icon={FolderTree}
                  title="No categories yet"
                  description="A shallow tree — Frames, Lenses, Solutions — is usually enough."
                />
              }
            />
          </CardContent>
        </Card>
      </div>

      <BrandEditor
        key={`brand-${session}`}
        open={brandOpen}
        onClose={() => setBrandOpen(false)}
        brand={brand}
      />

      <CategoryEditor
        key={`category-${session}`}
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        category={category}
      />

      <ConfirmDialog
        open={deletingBrand !== null}
        onClose={() => setDeletingBrand(null)}
        onConfirm={() =>
          deletingBrand &&
          deleteBrand.mutate(deletingBrand.id, { onSuccess: () => setDeletingBrand(null) })
        }
        title="Delete this brand?"
        description={
          <>
            <strong>{deletingBrand?.name}</strong> will be removed. No product carries it, so
            nothing loses its label.
          </>
        }
        confirmLabel="Delete brand"
        destructive
        pending={deleteBrand.isPending}
      />

      <ConfirmDialog
        open={deletingCategory !== null}
        onClose={() => setDeletingCategory(null)}
        onConfirm={() =>
          deletingCategory &&
          deleteCategory.mutate(deletingCategory.id, {
            onSuccess: () => setDeletingCategory(null),
          })
        }
        title="Delete this category?"
        description={
          <>
            <strong>{deletingCategory?.name}</strong> will be removed. It has no sub-categories
            and no products, so nothing is orphaned.
          </>
        }
        confirmLabel="Delete category"
        destructive
        pending={deleteCategory.isPending}
      />
    </div>
  );
}

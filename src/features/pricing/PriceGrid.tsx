import { BadgePercent, Pencil, Plus, Search, Tags, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { env } from '@/config/env';
import { usePermission } from '@/hooks/data/useAuth';
import {
  useDeletePriceEntry,
  usePriceEntries,
  useUpdatePriceEntry,
} from '@/hooks/data/usePricing';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { BulkAdjustDialog } from './BulkAdjustDialog';
import { InlineNumberCell } from './InlineNumberCell';
import { PriceEntryDialog } from './PriceEntryDialog';
import { PriceImportDialog } from './PriceImportDialog';

import { formatMoney, fromMinor, toMinor } from '@shared/money';

import type { PriceScope } from './scope';
import type { Column, SortState } from '@/components/common/DataTable';
import type { PriceEntryPayload } from '@shared/types';

/**
 * The price list for one scope — a tier, or one dealer's own prices.
 *
 * Qty breaks of a product sit together in ascending order (the server's default sort), so a row
 * block reads the way the business quotes: "1–2 dozen at ৳540, 3 dozen and up at ৳510".
 *
 * Price and the break quantity are edited **in place**; the window, note and status through the
 * row's edit dialog. Import and bulk % adjust act on this same scope and nothing else.
 */

const today = () => new Date().toISOString().slice(0, 10);

type Showing = 'current' | 'active' | 'all';

function describeWindow(e: PriceEntryPayload): string {
  if (!e.validFrom && !e.validTo) return 'Always';
  if (!e.validTo) return `From ${e.validFrom}`;
  if (!e.validFrom) return `Until ${e.validTo}`;
  return `${e.validFrom} → ${e.validTo}`;
}

/** In force today, ended, or not started yet — for the status column. */
function timing(e: PriceEntryPayload): 'CURRENT' | 'ENDED' | 'UPCOMING' {
  const d = today();
  if (e.validTo && e.validTo < d) return 'ENDED';
  if (e.validFrom && e.validFrom > d) return 'UPCOMING';
  return 'CURRENT';
}

export interface PriceGridProps {
  scope: PriceScope;
  /** What to call the scope in empty states and dialogs — "Dealer A", "Rahman Optics". */
  scopeLabel: string;
}

export function PriceGrid({ scope, scopeLabel }: PriceGridProps) {
  const canUpdate = usePermission('price:update');
  const canImport = usePermission('price:import');

  const [search, setSearch] = useState('');
  const [showing, setShowing] = useState<Showing>('current');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<SortState | null>(null);

  const [editing, setEditing] = useState<PriceEntryPayload | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const [deleting, setDeleting] = useState<PriceEntryPayload | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const q = useDebouncedValue(search);
  const updateEntry = useUpdatePriceEntry();
  const deleteEntry = useDeletePriceEntry();

  const { data, isLoading, isFetching } = usePriceEntries({
    ...scope,
    page,
    limit,
    q: q || undefined,
    ...(sort ? { sort: sort.field, order: sort.order } : {}),
    isActive: showing === 'all' ? undefined : true,
    activeOn: showing === 'current' ? today() : undefined,
  });

  const openDialog = (entry: PriceEntryPayload | null) => {
    setEditing(entry);
    setDialogSession((n) => n + 1);
    setDialogOpen(true);
  };

  const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });

  const columns: Column<PriceEntryPayload>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{e.productName}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{e.sku}</span>
            {e.variantLabel && <span> · {e.variantLabel}</span>}
          </p>
        </div>
      ),
    },
    {
      key: 'uomCode',
      header: 'Unit',
      sortable: true,
      cell: (e) => {
        const factor = e.uomOptions?.find((u) => u.code === e.uomCode)?.factor ?? 1;
        return (
          <span className="text-sm">
            {e.uomCode}
            {factor > 1 && <span className="text-muted-foreground"> ×{factor}</span>}
          </span>
        );
      },
    },
    {
      key: 'minQty',
      header: 'From qty',
      sortable: true,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (e) => (
        <InlineNumberCell
          value={e.minQty}
          display={`${e.minQty}+`}
          integer
          min={1}
          step={1}
          label={`From quantity for ${e.sku}`}
          disabled={!canUpdate}
          onSave={(next) => updateEntry.mutateAsync({ id: e.id, body: { minQty: next } })}
        />
      ),
    },
    {
      key: 'priceMinor',
      header: `Price (${env.currency})`,
      sortable: true,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (e) => (
        <InlineNumberCell
          value={fromMinor(e.priceMinor)}
          display={money(e.priceMinor)}
          label={`Price for ${e.sku} per ${e.uomCode}`}
          disabled={!canUpdate}
          className="font-medium"
          onSave={(next) =>
            updateEntry.mutateAsync({ id: e.id, body: { priceMinor: toMinor(next) } })
          }
        />
      ),
    },
    {
      key: 'validFrom',
      header: 'Valid',
      sortable: true,
      cell: (e) => <span className="whitespace-nowrap text-sm">{describeWindow(e)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (e) =>
        !e.isActive ? (
          <StatusPill status="INACTIVE" />
        ) : (
          <StatusPill
            status={timing(e)}
            tone={
              timing(e) === 'CURRENT'
                ? 'success'
                : timing(e) === 'UPCOMING'
                  ? 'info'
                  : 'neutral'
            }
            label={
              timing(e) === 'CURRENT'
                ? 'In force'
                : timing(e) === 'UPCOMING'
                  ? 'Upcoming'
                  : 'Ended'
            }
          />
        ),
    },
    ...(canUpdate
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'text-right',
            headClassName: 'text-right',
            cell: (e: PriceEntryPayload) => (
              <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openDialog(e)}
                  aria-label={`Edit price for ${e.sku}`}
                  title="Edit dates, note, status"
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleting(e)}
                  aria-label={`Remove price for ${e.sku}`}
                  title="Remove"
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  const filtered = Boolean(q) || showing !== 'current';

  return (
    <div className="space-y-4">
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
              setPage(1);
            }}
            placeholder="Search product name or SKU…"
            className="pl-9"
            aria-label="Search prices"
          />
        </div>

        <Select
          value={showing}
          onChange={(e) => {
            setShowing(e.target.value as Showing);
            setPage(1);
          }}
          className="w-44"
          aria-label="Which prices to show"
        >
          <option value="current">In force today</option>
          <option value="active">All active</option>
          <option value="all">Everything</option>
        </Select>

        <div className="ml-auto flex flex-wrap gap-2">
          {canUpdate && (
            <Button variant="outline" onClick={() => setAdjustOpen(true)}>
              <BadgePercent aria-hidden="true" />
              Bulk adjust
            </Button>
          )}
          {canImport && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload aria-hidden="true" />
              Import CSV
            </Button>
          )}
          {canUpdate && (
            <Button onClick={() => openDialog(null)}>
              <Plus aria-hidden="true" />
              Add price
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        sort={sort}
        onSortChange={setSort}
        empty={
          filtered ? (
            <EmptyState
              icon={Search}
              title="No price matches"
              description={
                showing === 'current'
                  ? undefined
                  : 'Nothing is wrong — the filters simply exclude everything.'
              }
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setShowing('current');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Tags}
              title={`No prices for ${scopeLabel} yet`}
              description="Until there are, quotes fall back to the next rule — the dealer's tier, then retail, then the product's default sell price."
              action={
                canUpdate && (
                  <Button size="sm" onClick={() => openDialog(null)}>
                    <Plus aria-hidden="true" />
                    Add price
                  </Button>
                )
              }
            />
          )
        }
      />

      <PriceEntryDialog
        key={dialogSession}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        scope={scope}
        entry={editing}
      />

      <PriceImportDialog
        key={importOpen ? 'import-open' : 'import-closed'}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        scope={scope}
        scopeLabel={scopeLabel}
      />

      <BulkAdjustDialog
        key={adjustOpen ? 'adjust-open' : 'adjust-closed'}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        scope={scope}
        scopeLabel={scopeLabel}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting && deleteEntry.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
        title="Remove this price?"
        description={
          <>
            {deleting?.sku} per {deleting?.uomCode} from {deleting?.minQty}. Orders already
            quoted keep the price they were given. For a price that was genuinely in force,
            setting an end date keeps a better record than removing it.
          </>
        }
        confirmLabel="Remove"
        destructive
        pending={deleteEntry.isPending}
      />
    </div>
  );
}

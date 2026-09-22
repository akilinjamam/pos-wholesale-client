import { Ban, Pencil, Plus, Search, Warehouse } from 'lucide-react';
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
import { usePermission } from '@/hooks/data/useAuth';
import { useDeactivateLocation, useLocations } from '@/hooks/data/useLocations';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { LOCATION_TYPES } from '@shared/enums';

import { LocationEditor } from './LocationEditor';

import type { Column, SortState } from '@/components/common/DataTable';
import type { LocationType } from '@shared/enums';
import type { LocationPayload } from '@shared/types';

/**
 * Warehouses, counters, transit and damage stores.
 *
 * `locationId` is this system's stock partition key — every balance, every ledger row and every
 * movement is scoped to one — so this screen is a prerequisite for Day 13 rather than an
 * administrative afterthought. Which is also why nothing here is ever deleted: a location with
 * ledger rows pointing at it must keep resolving, so DELETE deactivates.
 */
export function LocationsList() {
  const canCreate = usePermission('location:create');
  const canUpdate = usePermission('location:update');
  const canDelete = usePermission('location:delete');

  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | LocationType>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortState>({ field: 'code', order: 'asc' });

  const [editing, setEditing] = useState<LocationPayload | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  /** The editor's `key`, bumped per open — see the longer note in `RolesList`. */
  const [editorSession, setEditorSession] = useState(0);
  const [deactivating, setDeactivating] = useState<LocationPayload | null>(null);

  const q = useDebouncedValue(search);
  const deactivateLocation = useDeactivateLocation();

  const { data, isLoading, isFetching } = useLocations({
    page,
    limit,
    q: q || undefined,
    sort: sort.field,
    order: sort.order,
    type: type || undefined,
    isActive: activeFilter === '' ? undefined : activeFilter === 'true',
  });

  const openEditor = (location: LocationPayload | null) => {
    setEditing(location);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  };

  const columns: Column<LocationPayload>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      cell: (location) => (
        <span className="font-mono text-xs font-medium">{location.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      cell: (location) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{location.name}</p>
          {location.address && (
            <p className="truncate text-xs text-muted-foreground">{location.address}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (location) => <StatusPill status={location.type} tone="info" />,
    },
    {
      key: 'flags',
      header: 'Allows',
      cell: (location) => (
        <div className="flex flex-wrap gap-1">
          {location.allowsSales && <Badge variant="outline">sales</Badge>}
          {location.allowsPurchase && <Badge variant="outline">purchase</Badge>}
          {!location.allowsSales && !location.allowsPurchase && (
            <span className="text-xs text-muted-foreground">neither</span>
          )}
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (location) => <StatusPill status={location.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (location) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openEditor(location)}
            aria-label={canUpdate ? `Edit ${location.name}` : `View ${location.name}`}
            title={canUpdate ? 'Edit' : 'View'}
          >
            <Pencil />
          </Button>

          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              disabled={!location.isActive}
              title={location.isActive ? 'Deactivate' : 'Already deactivated'}
              onClick={() => setDeactivating(location)}
              aria-label={`Deactivate ${location.name}`}
            >
              <Ban />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const filtered = Boolean(q || type || activeFilter);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Locations"
        icon={Warehouse}
        description="Every stock balance and ledger row is scoped to one of these."
        actions={
          canCreate && (
            <Button onClick={() => openEditor(null)}>
              <Plus aria-hidden="true" />
              New location
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
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
            placeholder="Search locations…"
            className="pl-9"
            aria-label="Search locations"
          />
        </div>

        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value as '' | LocationType);
            setPage(1);
          }}
          className="w-40"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {LOCATION_TYPES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0) + value.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>

        <Select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value as '' | 'true' | 'false');
            setPage(1);
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
        rowKey={(location) => location.id}
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
        onRowClick={openEditor}
        empty={
          filtered ? (
            <EmptyState
              icon={Search}
              title="No location matches these filters"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setType('');
                    setActiveFilter('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Warehouse}
              title="No locations yet"
              description="Stock cannot be received or sold until there is somewhere to put it."
            />
          )
        }
      />

      <LocationEditor
        key={editorSession}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        location={editing}
      />

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() =>
          deactivating &&
          deactivateLocation.mutate(deactivating.id, {
            onSuccess: () => setDeactivating(null),
          })
        }
        title="Deactivate this location?"
        description={
          <>
            <strong>{deactivating?.name}</strong> will stop appearing in pickers and cannot
            receive new movements. It is not deleted: its stock balances and ledger history are
            kept, and every document that names it still resolves.
          </>
        }
        confirmLabel="Deactivate"
        destructive
        pending={deactivateLocation.isPending}
      />
    </div>
  );
}

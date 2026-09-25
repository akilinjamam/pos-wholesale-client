import { Plus, Search, UserCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
import { useEnrolParty, useParties } from '@/hooks/data/useParties';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { money } from './creditMath';
import { PartyEditor } from './PartyEditor';

import type { Column, SortState } from '@/components/common/DataTable';
import type { PartyPayload } from '@shared/types';

/**
 * Named counter customers — the walk-ins who were worth remembering.
 *
 * Most counter sales stay anonymous (`partyId: null` on the invoice, Day 18); a customer record
 * exists for the ones who come back, buy on account, or need a proper invoice. When one starts
 * buying in bulk, **Make dealer** adds the dealer role to the same record rather than creating a
 * second one, so their counter history and their wholesale account stay one ledger.
 *
 * There is no delete: the catalog grants none for customers, because a counter invoice will
 * point at them. Deactivate instead.
 */
export function CustomersList() {
  const navigate = useNavigate();
  const canCreate = usePermission('customer:create');
  const canMakeDealer = usePermission('dealer:create');

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortState>({ field: 'name', order: 'asc' });

  const [editing, setEditing] = useState<PartyPayload | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [promoting, setPromoting] = useState<PartyPayload | null>(null);

  const q = useDebouncedValue(search);
  const enrolDealer = useEnrolParty('DEALER');

  const { data, isLoading, isFetching } = useParties('CUSTOMER', {
    page,
    limit,
    q: q || undefined,
    sort: sort.field,
    order: sort.order,
    isActive: activeFilter === '' ? undefined : activeFilter === 'true',
  });

  const openEditor = (party: PartyPayload | null) => {
    setEditing(party);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  };

  const columns: Column<PartyPayload>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{p.code}</span>
            {p.roles.includes('DEALER') && (
              <Badge variant="outline" className="py-0">
                also dealer
              </Badge>
            )}
          </p>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      cell: (p) => <span className="text-sm tabular-nums">{p.phone ?? '—'}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      cell: (p) => <span className="text-sm">{p.email ?? '—'}</span>,
    },
    {
      key: 'currentBalanceMinor',
      header: 'Balance',
      sortable: true,
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (p) => money(p.currentBalanceMinor),
    },
    {
      key: 'isActive',
      header: 'Status',
      cell: (p) => <StatusPill status={p.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    ...(canMakeDealer
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'text-right',
            headClassName: 'text-right',
            cell: (p: PartyPayload) =>
              p.roles.includes('DEALER') ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/dealers/profile/${p.id}`);
                  }}
                >
                  Dealer profile
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPromoting(p);
                  }}
                >
                  <UserCheck aria-hidden="true" />
                  Make dealer
                </Button>
              ),
          },
        ]
      : []),
  ];

  const filtered = Boolean(q || activeFilter);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        icon={UserRound}
        description="Named counter customers. Anonymous walk-ins are not kept here."
        actions={
          canCreate && (
            <Button onClick={() => openEditor(null)}>
              <Plus aria-hidden="true" />
              New customer
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
              setPage(1);
            }}
            placeholder="Search name, code, phone…"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
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
          <option value="false">Inactive</option>
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
          setPage(1);
        }}
        sort={sort}
        onSortChange={setSort}
        onRowClick={openEditor}
        empty={
          filtered ? (
            <EmptyState
              icon={Search}
              title="No customer matches these filters"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setActiveFilter('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={UserRound}
              title="No customers yet"
              description="Counter customers can also be added from the sale screen once it lands (Day 19)."
            />
          )
        }
      />

      <PartyEditor
        key={editorSession}
        role="CUSTOMER"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        party={editing}
      />

      <ConfirmDialog
        open={promoting !== null}
        onClose={() => setPromoting(null)}
        onConfirm={() =>
          promoting &&
          enrolDealer.mutate(
            { id: promoting.id },
            {
              onSuccess: (dealer) => {
                setPromoting(null);
                navigate(`/dealers/profile/${dealer.id}`);
              },
            },
          )
        }
        title="Make this customer a dealer?"
        description={
          <>
            <strong>{promoting?.name}</strong> keeps their code and history, and gains a dealer
            account with the default terms and no credit limit. Set the limit on the dealer
            profile.
          </>
        }
        confirmLabel="Make dealer"
        pending={enrolDealer.isPending}
      />
    </div>
  );
}

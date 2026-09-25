import { Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { usePermission } from '@/hooks/data/useAuth';
import { useParties } from '@/hooks/data/useParties';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { CreditUsage, DealerStatus } from './credit';
import { PartyEditor } from './PartyEditor';

import type { Column, SortState } from '@/components/common/DataTable';
import type { PartyPayload } from '@shared/types';

/**
 * The dealer accounts — who they are, what they owe, and whether they may order on credit.
 *
 * **No ageing badge yet**, though the plan lists one: ageing is computed from open invoices,
 * and invoices do not exist until Day 24 (the bucket report lands on Day 30). A badge reading
 * "current" for every dealer would be a claim the system cannot back, so the column joins this
 * table when there is something to age. Balance is shown now because it is a real field, even
 * though it stays at zero until the ledger (Day 27) starts moving it.
 */

/** Status is one select over two server filters, because a person thinks of it as one thing. */
type StatusFilter = '' | 'active' | 'inactive' | 'hold';

export function DealersList() {
  const navigate = useNavigate();
  const canCreate = usePermission('dealer:create');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortState>({ field: 'name', order: 'asc' });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);

  const q = useDebouncedValue(search);

  const { data, isLoading, isFetching } = useParties('DEALER', {
    page,
    limit,
    q: q || undefined,
    sort: sort.field,
    order: sort.order,
    isActive: status === 'active' ? true : status === 'inactive' ? false : undefined,
    creditHold: status === 'hold' ? true : undefined,
  });

  const openProfile = (p: PartyPayload) => navigate(`/dealers/profile/${p.id}`);

  const openCreate = () => {
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  };

  const columns: Column<PartyPayload>[] = [
    {
      key: 'name',
      header: 'Dealer',
      sortable: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.displayName ?? p.name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="font-mono">{p.code}</span>
            {p.displayName && <span className="truncate">· {p.name}</span>}
            {/* The one-record-many-roles case, surfaced where it matters: this dealer's balance
                nets against what we owe them as a supplier. */}
            {p.roles.includes('SUPPLIER') && (
              <Badge variant="outline" className="py-0">
                also supplier
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
      key: 'territory',
      header: 'Territory',
      cell: (p) => (
        <div className="text-sm">
          <p>{p.dealer?.territory ?? <span className="text-muted-foreground">—</span>}</p>
          {p.dealer?.salespersonName && (
            <p className="text-xs text-muted-foreground">{p.dealer.salespersonName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'currentBalanceMinor',
      header: 'Balance / limit',
      sortable: true,
      headClassName: 'text-right',
      cell: (p) => (
        <CreditUsage
          balanceMinor={p.currentBalanceMinor}
          limitMinor={p.dealer?.creditLimitMinor ?? 0}
          className="ml-auto max-w-[12rem]"
        />
      ),
    },
    {
      key: 'terms',
      header: 'Terms',
      className: 'text-right tabular-nums text-sm',
      headClassName: 'text-right',
      cell: (p) => (p.dealer ? `${p.dealer.paymentTermsDays} d` : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => <DealerStatus party={p} />,
    },
  ];

  const filtered = Boolean(q || status);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dealers"
        icon={Users}
        description="Accounts, credit limits and balances. Open a dealer for the full profile."
        actions={
          canCreate && (
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" />
              New dealer
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
            aria-label="Search dealers"
          />
        </div>

        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
          className="w-40"
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="hold">On credit hold</option>
          <option value="inactive">Inactive</option>
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
        onRowClick={openProfile}
        empty={
          filtered ? (
            <EmptyState
              icon={Search}
              title="No dealer matches these filters"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatus('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No dealers yet"
              description="Add the shops you sell to on account. If one already supplies you, the editor will find them so they keep a single ledger."
              action={
                canCreate && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    New dealer
                  </Button>
                )
              }
            />
          )
        }
      />

      <PartyEditor
        key={editorSession}
        role="DEALER"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        party={null}
        onSaved={openProfile}
      />
    </div>
  );
}

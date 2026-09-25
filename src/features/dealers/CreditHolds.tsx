import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/data/useAuth';
import { useParties } from '@/hooks/data/useParties';

import { CreditHoldDialog } from './CreditHoldDialog';
import { CreditUsage } from './credit';

import type { Column, SortState } from '@/components/common/DataTable';
import type { PartyPayload } from '@shared/types';

/**
 * Every dealer on credit hold, longest-standing first.
 *
 * A hold is meant to be temporary — a bounced cheque, a disputed invoice — and the failure mode
 * is a hold nobody remembers placing, silently turning away a dealer who paid months ago. This
 * screen exists to be walked through weekly: each row says why and since when, and lifting it is
 * one click for whoever holds `dealer:creditHold`.
 */

const DAY_MS = 86_400_000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

export function CreditHolds() {
  const navigate = useNavigate();
  const canHold = usePermission('dealer:creditHold');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortState>({
    field: 'dealer.creditHoldSince',
    order: 'asc',
  });
  const [lifting, setLifting] = useState<PartyPayload | null>(null);

  const { data, isLoading, isFetching } = useParties('DEALER', {
    page,
    limit,
    creditHold: true,
    sort: sort.field,
    order: sort.order,
  });

  const columns: Column<PartyPayload>[] = [
    {
      key: 'name',
      header: 'Dealer',
      sortable: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.displayName ?? p.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (p) => (
        <span className="text-sm">
          {p.dealer?.creditHoldReason ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: 'since',
      header: 'On hold',
      sortable: 'dealer.creditHoldSince',
      cell: (p) => {
        const days = daysSince(p.dealer?.creditHoldSince ?? null);
        return (
          <div className="text-sm">
            <p
              className={
                days !== null && days >= 30 ? 'font-medium text-destructive' : undefined
              }
            >
              {days === null
                ? '—'
                : days === 0
                  ? 'Today'
                  : `${days} day${days === 1 ? '' : 's'}`}
            </p>
            {p.dealer?.creditHoldSince && (
              <p className="text-xs text-muted-foreground">
                since {new Date(p.dealer.creditHoldSince).toLocaleDateString()}
              </p>
            )}
          </div>
        );
      },
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
    ...(canHold
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            className: 'text-right',
            headClassName: 'text-right',
            cell: (p: PartyPayload) => (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setLifting(p);
                }}
              >
                <ShieldCheck aria-hidden="true" />
                Lift hold
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Credit holds"
        icon={ShieldAlert}
        description="Dealers blocked from new credit orders, longest-standing first. Review weekly."
      />

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
        onRowClick={(p) => navigate(`/dealers/profile/${p.id}`)}
        empty={
          <EmptyState
            icon={ShieldCheck}
            title="No dealer is on hold"
            description="Holds are placed from a dealer's profile, and listed here until lifted."
          />
        }
      />

      <CreditHoldDialog
        key={lifting?.id ?? 'none'}
        dealer={lifting}
        onClose={() => setLifting(null)}
      />
    </div>
  );
}

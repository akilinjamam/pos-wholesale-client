import { FileText, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { money } from '@/features/dealers/creditMath';
import { useInvoices } from '@/hooks/data/useInvoices';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { humanise } from '@/lib/utils';

import { daysOverdue } from './invoiceFormat';

import type { Column, SortState } from '@/components/common/DataTable';
import type { PaymentStatus, SalesChannel } from '@shared/enums';
import type { InvoicePayload } from '@shared/types';

/**
 * Invoices of both channels, with what each still owes. Used on its own (Billing → Invoices) and,
 * with `partyId`, as a dealer's Invoices tab. A row opens the invoice.
 */
export function InvoicesTable({ partyId }: { partyId?: string }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<'' | SalesChannel>(partyId ? 'WHOLESALE' : '');
  const [state, setState] = useState<'' | 'OPEN' | PaymentStatus>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ field: 'invoiceDate', order: 'desc' });
  const q = useDebouncedValue(text.trim(), 250);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const { data, isLoading, isFetching } = useInvoices({
    page,
    limit: 25,
    q: q || undefined,
    partyId,
    channel: channel || undefined,
    ...(state === 'OPEN' ? { open: true } : state ? { paymentStatus: state } : {}),
    from: from || undefined,
    to: to || undefined,
    sort: sort.field,
    order: sort.order,
  });

  const columns: Column<InvoicePayload>[] = [
    {
      key: 'docNo',
      header: 'Invoice',
      sortable: true,
      cell: (i) => (
        <div>
          <p className="font-mono text-sm">{i.docNo ?? 'Draft'}</p>
          <p className="text-xs text-muted-foreground">
            {i.series === 'OB' ? 'Opening balance' : humanise(i.channel)}
            {i.status === 'CANCELLED' && ' · cancelled'}
          </p>
        </div>
      ),
    },
    {
      key: 'invoiceDate',
      header: 'Date',
      sortable: true,
      cell: (i) => new Date(i.invoiceDate).toLocaleDateString(),
    },
    ...(partyId
      ? []
      : [
          {
            key: 'customer',
            header: 'Customer',
            cell: (i: InvoicePayload) => (
              <span className="font-medium">{i.customerName ?? 'Walk-in'}</span>
            ),
          },
        ]),
    {
      key: 'grandTotalMinor',
      header: 'Total',
      sortable: true,
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (i) => money(i.grandTotalMinor),
    },
    {
      key: 'settled',
      header: 'Paid · credited',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (i) => (
        <span className="text-sm">
          {money(i.paidMinor)}
          {i.creditedMinor > 0 && (
            <span className="block text-xs text-muted-foreground">
              + {money(i.creditedMinor)} credit
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Owed',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (i) => {
        const late = daysOverdue(i);
        return (
          <div>
            <p className={i.balanceMinor > 0 ? 'font-medium' : 'text-muted-foreground'}>
              {money(i.balanceMinor)}
            </p>
            {late && (
              <Badge variant="outline" className="border-destructive/40 py-0 text-destructive">
                {late}d overdue
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'paymentStatus',
      header: 'Status',
      cell: (i) => <StatusPill status={i.paymentStatus} />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={text}
            onChange={(e) => reset(setText)(e.target.value)}
            placeholder={partyId ? 'Invoice number…' : 'Invoice number or customer…'}
            className="pl-9"
            aria-label="Search invoices"
          />
        </div>
        {!partyId && (
          <Select
            value={channel}
            onChange={(e) => reset(setChannel)(e.target.value as '' | SalesChannel)}
            className="w-40"
            aria-label="Channel"
          >
            <option value="">Both channels</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="COUNTER">Counter</option>
          </Select>
        )}
        <Select
          value={state}
          onChange={(e) => reset(setState)(e.target.value as '' | 'OPEN' | PaymentStatus)}
          className="w-44"
          aria-label="Payment status"
        >
          <option value="">Any payment status</option>
          <option value="OPEN">Something owed</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIAL">Part paid</option>
          <option value="PAID">Paid</option>
        </Select>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => reset(setFrom)(e.target.value)}
          className="w-40"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => reset(setTo)(e.target.value)}
          className="w-40"
          aria-label="To date"
        />
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(i) => i.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        onRowClick={(i) => navigate(`/billing/invoices/${i.id}`)}
        empty={<EmptyState icon={FileText} title="No invoices match" />}
      />
    </div>
  );
}

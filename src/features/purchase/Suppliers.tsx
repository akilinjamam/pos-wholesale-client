import { BookOpen, HandCoins, Loader2, Plus, Search, Truck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorMap } from '@/features/inventory/docHelpers';
import { useCan } from '@/hooks/data/useAuth';
import { useCreateParty, useParties, useUpdateParty } from '@/hooks/data/useParties';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { money } from './purchaseFormat';

import type { Column } from '@/components/common/DataTable';
import type { CreateSupplierInput } from '@shared/party';
import type { PartyPayload } from '@shared/types';

/**
 * Suppliers (Day 35) — who we buy from, their terms, and what we owe each. A supplier's balance is
 * negative while we owe them; it is shown the way the buyer says it: "we owe ৳X".
 */
export function Suppliers() {
  const navigate = useNavigate();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PartyPayload | 'new' | null>(null);
  const q = useDebouncedValue(search);
  const { data, isLoading, isFetching } = useParties('SUPPLIER', {
    page,
    limit: 25,
    q: q || undefined,
    sort: 'name',
    order: 'asc',
  });

  const columns: Column<PartyPayload>[] = [
    {
      key: 'name',
      header: 'Supplier',
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.displayName ?? p.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', cell: (p) => p.phone ?? '—' },
    {
      key: 'terms',
      header: 'Terms',
      cell: (p) =>
        p.supplier
          ? `${p.supplier.paymentTermsDays} days · lead ${p.supplier.leadTimeDays} d`
          : '—',
    },
    {
      key: 'balance',
      header: 'Balance',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (p) =>
        p.currentBalanceMinor < 0 ? (
          <span>We owe {money(-p.currentBalanceMinor)}</span>
        ) : p.currentBalanceMinor > 0 ? (
          <span className="text-success">They owe {money(p.currentBalanceMinor)}</span>
        ) : (
          <span className="text-muted-foreground">Settled</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => <StatusPill status={p.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (p) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {can('ledger:read') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/purchase/statement?partyId=${p.id}`)}
            >
              <BookOpen aria-hidden="true" />
              Statement
            </Button>
          )}
          {can('payment:supplierPay') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/purchase/payments/new?partyId=${p.id}`)}
            >
              <HandCoins aria-hidden="true" />
              Pay
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Suppliers"
        icon={Truck}
        description="Manufacturers and importers we buy from, with their terms and what we owe each."
        actions={
          can('supplier:create') && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              New supplier
            </Button>
          )
        }
      />
      <div className="relative w-72">
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
          placeholder="Name, code or phone…"
          className="pl-9"
          aria-label="Search suppliers"
        />
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={can('supplier:update') ? (p) => setEditing(p) : undefined}
        empty={<EmptyState icon={Truck} title="No suppliers yet" />}
      />
      {editing && (
        <SupplierDialog
          key={editing === 'new' ? 'new' : editing.id}
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier: PartyPayload | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(supplier?.name ?? '');
  const [displayName, setDisplayName] = useState(supplier?.displayName ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [terms, setTerms] = useState(String(supplier?.supplier?.paymentTermsDays ?? 30));
  const [lead, setLead] = useState(String(supplier?.supplier?.leadTimeDays ?? 7));
  const bank = supplier?.supplier?.bankAccount;
  const [bankName, setBankName] = useState(bank?.bankName ?? '');
  const [accountName, setAccountName] = useState(bank?.accountName ?? '');
  const [accountNo, setAccountNo] = useState(bank?.accountNo ?? '');
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateParty('SUPPLIER');
  const update = useUpdateParty('SUPPLIER');
  const pending = create.isPending || update.isPending;

  const save = () => {
    setErrors({});
    const hasBank = bankName.trim() || accountName.trim() || accountNo.trim();
    const body: CreateSupplierInput = {
      name: name.trim(),
      displayName: displayName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      isActive,
      notes: notes.trim() || null,
      supplier: {
        paymentTermsDays: Number(terms) || 0,
        leadTimeDays: Number(lead) || 0,
        bankAccount: hasBank
          ? {
              bankName: bankName.trim(),
              accountName: accountName.trim(),
              accountNo: accountNo.trim(),
            }
          : null,
      },
    };
    const onError = (e: unknown) => setErrors(errorMap(e));
    if (supplier) update.mutate({ id: supplier.id, body }, { onSuccess: onClose, onError });
    else create.mutate(body, { onSuccess: onClose, onError });
  };

  const text = (
    label: string,
    value: string,
    set: (v: string) => void,
    path: string,
    extra: Partial<React.ComponentProps<typeof Input>> = {},
  ) => (
    <Field label={label} error={errors[path]}>
      {(props) => (
        <Input {...props} {...extra} value={value} onChange={(e) => set(e.target.value)} />
      )}
    </Field>
  );

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={supplier ? `Edit ${supplier.name}` : 'New supplier'}
      description={supplier ? `Code ${supplier.code}` : 'A code is given when it is saved.'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {text('Name', name, setName, 'name')}
        {text('Trading name', displayName, setDisplayName, 'displayName')}
        {text('Phone', phone, setPhone, 'phone', { inputMode: 'tel' })}
        {text('Email', email, setEmail, 'email', { type: 'email' })}
        {text('Payment terms (days)', terms, setTerms, 'supplier.paymentTermsDays', {
          type: 'number',
          min: 0,
        })}
        {text('Lead time (days)', lead, setLead, 'supplier.leadTimeDays', {
          type: 'number',
          min: 0,
        })}
        {text('Bank', bankName, setBankName, 'supplier.bankAccount.bankName')}
        {text('Account name', accountName, setAccountName, 'supplier.bankAccount.accountName')}
        {text('Account no.', accountNo, setAccountNo, 'supplier.bankAccount.accountNo')}
        {text('Notes', notes, setNotes, 'notes')}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active" />
          Active — inactive suppliers drop out of pickers
        </label>
      </div>
    </Dialog>
  );
}

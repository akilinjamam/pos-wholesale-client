import { zodResolver } from '@hookform/resolvers/zod';
import { Layers, Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { fieldErrors } from '@/api/client';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { usePermission } from '@/hooks/data/useAuth';
import {
  useCreatePriceTier,
  useDeletePriceTier,
  usePriceTiers,
  useUpdatePriceTier,
} from '@/hooks/data/usePricing';

import { createPriceTierSchema } from '@shared/pricing';

import type { Column } from '@/components/common/DataTable';
import type { CreatePriceTierInput } from '@shared/pricing';
import type { PriceTierPayload } from '@shared/types';
import type { FieldPath } from 'react-hook-form';

/**
 * The price tiers — the ladder a dealer sits on.
 *
 * Deleting is offered only for a tier nothing uses; the server refuses otherwise, and says how
 * many dealers and prices are in the way. The counter's tier (Company settings) can be neither
 * deleted nor deactivated, since every walk-in sale is priced from it.
 */
export function PriceTiers() {
  const navigate = useNavigate();
  const canManage = usePermission('priceTier:manage');
  const { data, isLoading, isFetching } = usePriceTiers({ limit: 200 });
  const deleteTier = useDeletePriceTier();

  const [editing, setEditing] = useState<PriceTierPayload | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [deleting, setDeleting] = useState<PriceTierPayload | null>(null);

  const openEditor = (tier: PriceTierPayload | null) => {
    setEditing(tier);
    setEditorSession((n) => n + 1);
    setEditorOpen(true);
  };

  const columns: Column<PriceTierPayload>[] = [
    {
      key: 'name',
      header: 'Tier',
      cell: (t) => (
        <div>
          <p className="font-medium">{t.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{t.code}</p>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      cell: (t) => (
        <span className="text-sm text-muted-foreground">{t.description ?? '—'}</span>
      ),
    },
    {
      key: 'dealerCount',
      header: 'Dealers',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (t) => t.dealerCount ?? 0,
    },
    {
      key: 'entryCount',
      header: 'Prices',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (t) => t.entryCount ?? 0,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill status={t.isActive ? 'ACTIVE' : 'INACTIVE'} />
          {t.isDefaultRetail && <StatusPill status="RETAIL" tone="info" label="Counter tier" />}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      headClassName: 'text-right',
      cell: (t) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/catalog/price-lists?tier=${t.id}`)}
          >
            <Tags aria-hidden="true" />
            Prices
          </Button>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openEditor(t)}
                aria-label={`Edit ${t.name}`}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                disabled={
                  t.isDefaultRetail || (t.dealerCount ?? 0) > 0 || (t.entryCount ?? 0) > 0
                }
                title={
                  t.isDefaultRetail
                    ? 'The counter tier cannot be deleted'
                    : (t.dealerCount ?? 0) > 0 || (t.entryCount ?? 0) > 0
                      ? 'In use — deactivate it instead'
                      : 'Delete'
                }
                onClick={() => setDeleting(t)}
                aria-label={`Delete ${t.name}`}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Price tiers"
        icon={Layers}
        description="The levels a dealer can be priced at. Each tier has its own price list."
        actions={
          canManage && (
            <Button onClick={() => openEditor(null)}>
              <Plus aria-hidden="true" />
              New tier
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(t) => t.id}
        isLoading={isLoading}
        isFetching={isFetching}
        onRowClick={(t) => navigate(`/catalog/price-lists?tier=${t.id}`)}
        empty={<EmptyState icon={Layers} title="No price tiers yet" />}
      />

      <TierEditor
        key={editorSession}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        tier={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting && deleteTier.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
        title="Delete this tier?"
        description={<>{deleting?.name} has no dealers and no prices. This cannot be undone.</>}
        confirmLabel="Delete"
        destructive
        pending={deleteTier.isPending}
      />
    </div>
  );
}

function TierEditor({
  open,
  onClose,
  tier,
}: {
  open: boolean;
  onClose: () => void;
  tier: PriceTierPayload | null;
}) {
  const createTier = useCreatePriceTier();
  const updateTier = useUpdatePriceTier();
  const pending = createTier.isPending || updateTier.isPending;

  const form = useForm<CreatePriceTierInput>({
    // The server's own schema — the form cannot accept a code the API would refuse.
    resolver: zodResolver(createPriceTierSchema),
    defaultValues: {
      code: tier?.code ?? '',
      name: tier?.name ?? '',
      description: tier?.description ?? '',
      level: tier?.level ?? 0,
      isActive: tier?.isActive ?? true,
    },
    mode: 'onTouched',
  });
  const errors = form.formState.errors;
  const isActive = useWatch({ control: form.control, name: 'isActive' });

  const onError = (error: unknown) => {
    for (const f of fieldErrors(error)) {
      form.setError(f.path as FieldPath<CreatePriceTierInput>, { message: f.message });
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    const body = { ...values, description: values.description?.trim() || null };
    if (tier) {
      updateTier.mutate({ id: tier.id, body }, { onSuccess: onClose, onError });
    } else {
      createTier.mutate(body, { onSuccess: onClose, onError });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={tier ? `Edit ${tier.name}` : 'New price tier'}
      description="The code is what imports and reports refer to, so it is fixed once created."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {tier ? 'Save' : 'Create tier'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" required error={errors.code?.message}>
          {(props) => (
            <Input
              {...props}
              {...form.register('code')}
              className="font-mono uppercase"
              placeholder="DEALER_C"
              disabled={Boolean(tier)}
            />
          )}
        </Field>
        <Field label="Name" required error={errors.name?.message}>
          {(props) => <Input {...props} {...form.register('name')} placeholder="Dealer C" />}
        </Field>
        <Field label="Order" error={errors.level?.message} hint="Lowest first in every list.">
          {(props) => (
            <Input
              {...props}
              {...form.register('level', { valueAsNumber: true })}
              type="number"
              min={0}
            />
          )}
        </Field>
        <Field label="Description" error={errors.description?.message}>
          {(props) => <Input {...props} {...form.register('description')} />}
        </Field>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <Switch
            checked={Boolean(isActive)}
            onCheckedChange={(next) => form.setValue('isActive', next, { shouldDirty: true })}
            disabled={tier?.isDefaultRetail}
          />
          {tier?.isDefaultRetail
            ? 'Active — the counter tier must stay active.'
            : 'Active — an inactive tier cannot be assigned to dealers.'}
        </label>
      </form>
    </Dialog>
  );
}

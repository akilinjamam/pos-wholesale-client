import { Layers, Tags } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/data/useAuth';
import { usePriceTiers } from '@/hooks/data/usePricing';

import { PriceGrid } from './PriceGrid';

/**
 * One tier's price list at a time.
 *
 * The chosen tier lives in the URL (`?tier=`), so "the Dealer B list" is a link someone can
 * send. Dealer-specific prices are not here: they live on the dealer's own profile, under
 * Pricing, where the person negotiating with that dealer looks for them.
 */
export function PriceLists() {
  const [params, setParams] = useSearchParams();
  const canManageTiers = usePermission('priceTier:manage');
  const { data, isLoading } = usePriceTiers({ limit: 200 });

  const tiers = data?.items ?? [];
  const tier = tiers.find((t) => t.id === params.get('tier')) ?? tiers[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Price lists"
        icon={Tags}
        description="Prices per tier, per unit, with quantity breaks. A dealer's own prices are on their profile."
        actions={
          <Link to="/catalog/price-tiers" className={buttonVariants({ variant: 'outline' })}>
            <Layers aria-hidden="true" />
            {canManageTiers ? 'Manage tiers' : 'Tiers'}
          </Link>
        }
      />

      {isLoading ? (
        <Skeleton className="h-10 w-72" />
      ) : !tier ? (
        <EmptyState
          icon={Layers}
          title="No price tiers yet"
          description="Create a tier first — Retail, Dealer A and so on. Prices always belong to one."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={tier.id}
              onChange={(e) => setParams({ tier: e.target.value }, { replace: true })}
              className="w-64"
              aria-label="Price tier"
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </Select>
            <span className="font-mono text-xs text-muted-foreground">{tier.code}</span>
            {tier.isDefaultRetail && (
              <StatusPill status="RETAIL" tone="info" label="Counter tier" />
            )}
            <span className="text-sm text-muted-foreground">
              {tier.dealerCount ?? 0} dealer(s) · {tier.entryCount ?? 0} price(s)
            </span>
          </div>

          {/* Keyed by tier so paging, search and dialogs reset when the tier changes. */}
          <PriceGrid key={tier.id} scope={{ tierId: tier.id }} scopeLabel={tier.name} />
        </>
      )}
    </div>
  );
}

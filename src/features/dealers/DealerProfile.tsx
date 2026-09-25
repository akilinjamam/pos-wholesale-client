import {
  ArrowLeft,
  BadgePercent,
  BookOpen,
  FileText,
  Gauge,
  MapPin,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { cn, humanise } from '@/lib/utils';
import { usePermission } from '@/hooks/data/useAuth';
import { useParty } from '@/hooks/data/useParties';

import { CreditHoldDialog } from './CreditHoldDialog';
import { CreditLimitDialog } from './CreditLimitDialog';
import { CreditUsage, DealerStatus, HoldBanner } from './credit';
import { money } from './creditMath';
import { PartyEditor } from './PartyEditor';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PartyPayload } from '@shared/types';

/**
 * One dealer, everything about them.
 *
 * Seven tabs from the start, although four have nothing behind them yet: the shape of the page
 * is settled now, and each later day fills a tab rather than redesigning the screen. The empty
 * tabs say *when* they fill, so nobody reads an empty ledger as "this dealer owes nothing".
 *
 * The active tab lives in the URL (`?tab=`), so a link to a dealer's ledger is a link to the
 * ledger, and the browser's back button returns to the tab you came from.
 */

const TABS = [
  'info',
  'addresses',
  'pricing',
  'ledger',
  'invoices',
  'orders',
  'returns',
] as const;
type TabKey = (typeof TABS)[number];

/** The tabs a later day fills, and what fills them. */
const LATER: Partial<Record<TabKey, { icon: LucideIcon; title: string; day: string }>> = {
  pricing: {
    icon: BadgePercent,
    title: 'Dealer pricing arrives with price lists',
    day: 'Price tiers and dealer-specific prices land on Day 11; the price check on Day 12.',
  },
  ledger: {
    icon: BookOpen,
    title: 'The ledger starts with opening balances',
    day: 'Every debit and credit, with a running balance, from Day 27.',
  },
  invoices: {
    icon: FileText,
    title: 'No invoices yet',
    day: 'Wholesale invoices are raised on dispatch from Day 24.',
  },
  orders: {
    icon: ShoppingCart,
    title: 'No orders yet',
    day: 'Wholesale orders arrive on Day 22, and the order builder on Day 23.',
  },
  returns: {
    icon: RotateCcw,
    title: 'No returns yet',
    day: 'Sales returns and credit notes arrive on Day 36.',
  },
};

function isTab(value: string | null): value is TabKey {
  return (TABS as readonly string[]).includes(value ?? '');
}

export function DealerProfile() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab: TabKey = isTab(params.get('tab')) ? (params.get('tab') as TabKey) : 'info';

  const canUpdate = usePermission('dealer:update');
  const canSetCredit = usePermission('dealer:setCreditLimit');
  const canHold = usePermission('dealer:creditHold');

  const { data: dealer, isLoading, isError } = useParty('DEALER', id);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [holdOf, setHoldOf] = useState<PartyPayload | null>(null);
  const [limitOf, setLimitOf] = useState<PartyPayload | null>(null);

  const setTab = (next: string) =>
    setParams(next === 'info' ? {} : { tab: next }, { replace: true });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || !dealer) {
    return (
      <EmptyState
        icon={Users}
        title="Dealer not found"
        description="It may have been removed, or the link points at a party that is not a dealer."
        action={
          <Link
            to="/dealers/list"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Back to dealers
          </Link>
        }
      />
    );
  }

  const d = dealer.dealer;
  const later = LATER[tab];

  return (
    <div className="space-y-5">
      <Link
        to="/dealers/list"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2')}
      >
        <ArrowLeft aria-hidden="true" />
        Dealers
      </Link>

      <PageHeader
        title={dealer.displayName ?? dealer.name}
        icon={Users}
        description={[dealer.code, dealer.displayName ? dealer.name : null, dealer.phone]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {canHold && (
              <Button variant="outline" onClick={() => setHoldOf(dealer)}>
                {d?.creditHold ? (
                  <ShieldCheck aria-hidden="true" />
                ) : (
                  <ShieldAlert aria-hidden="true" />
                )}
                {d?.creditHold ? 'Lift hold' : 'Put on hold'}
              </Button>
            )}
            {/* The dedicated route: ACCOUNTS holds this grant without `dealer:update`. */}
            {canSetCredit && !canUpdate && (
              <Button variant="outline" onClick={() => setLimitOf(dealer)}>
                <Gauge aria-hidden="true" />
                Credit terms
              </Button>
            )}
            <Button
              onClick={() => {
                setEditorSession((n) => n + 1);
                setEditorOpen(true);
              }}
            >
              <Pencil aria-hidden="true" />
              {canUpdate ? 'Edit' : 'View details'}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <DealerStatus party={dealer} />
        {dealer.roles.map((r) => (
          <Badge key={r} variant="outline">
            {humanise(r)}
          </Badge>
        ))}
        {dealer.tags.map((t) => (
          <Badge key={t} variant="secondary">
            {t}
          </Badge>
        ))}
      </div>

      <HoldBanner party={dealer} />

      {d && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Balance" hint="Positive means they owe us.">
            <span className="tabular-nums">{money(dealer.currentBalanceMinor)}</span>
          </Stat>
          <Stat label="Credit used">
            <CreditUsage
              balanceMinor={dealer.currentBalanceMinor}
              limitMinor={d.creditLimitMinor}
            />
          </Stat>
          <Stat
            label="Available"
            hint={d.creditLimitMinor > 0 ? 'Limit less balance.' : 'Cash only.'}
          >
            <span className="tabular-nums">
              {d.creditLimitMinor > 0
                ? money(Math.max(0, d.creditLimitMinor - dealer.currentBalanceMinor))
                : '—'}
            </span>
          </Stat>
          <Stat label="Payment terms" hint="Due date = invoice date + terms.">
            {d.paymentTermsDays} days
          </Stat>
        </div>
      )}

      <Tabs
        label="Dealer sections"
        value={tab}
        onValueChange={setTab}
        items={TABS.map((t) => ({
          value: t,
          label: humanise(t),
          badge:
            t === 'addresses' && dealer.addresses.length > 0 ? (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                {dealer.addresses.length}
              </span>
            ) : undefined,
        }))}
      >
        {tab === 'info' && <InfoTab dealer={dealer} />}
        {tab === 'addresses' && <AddressesTab dealer={dealer} />}
        {later && (
          <Card>
            <EmptyState icon={later.icon} title={later.title} description={later.day} />
          </Card>
        )}
      </Tabs>

      <PartyEditor
        key={editorSession}
        role="DEALER"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        party={dealer}
      />
      <CreditHoldDialog
        key={`hold-${holdOf?.id ?? ''}`}
        dealer={holdOf}
        onClose={() => setHoldOf(null)}
      />
      <CreditLimitDialog
        key={`limit-${limitOf?.id ?? ''}`}
        dealer={limitOf}
        onClose={() => setLimitOf(null)}
      />
    </div>
  );
}

function Stat({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="text-lg font-semibold">{children}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** A definition list row that shows a dash rather than disappearing when empty. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">
        {value === null || value === undefined || value === '' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function InfoTab({ dealer }: { dealer: PartyPayload }) {
  const d = dealer.dealer;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="p-4">
          <p className="mb-1 text-sm font-medium">Contact & registration</p>
          <dl className="divide-y">
            <Row label="Legal name" value={dealer.name} />
            <Row label="Trading name" value={dealer.displayName} />
            <Row label="Phone" value={dealer.phone} />
            <Row label="Email" value={dealer.email} />
            <Row label="TIN" value={dealer.tin} />
            <Row label="BIN" value={dealer.bin} />
            <Row label="Trade licence" value={dealer.tradeLicenseNo} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-1 text-sm font-medium">Commercial terms</p>
          <dl className="divide-y">
            <Row label="Credit limit" value={d ? money(d.creditLimitMinor) : null} />
            <Row label="Payment terms" value={d ? `${d.paymentTermsDays} days` : null} />
            <Row label="Price tier" value={d?.priceTierId ? 'Assigned' : 'Default (retail)'} />
            <Row label="Trade discount" value={d ? `${d.discountPct}%` : null} />
            <Row label="Salesperson" value={d?.salespersonName} />
            <Row label="Territory" value={d?.territory} />
            <Row
              label="Trading since"
              value={d?.since ? new Date(`${d.since}T00:00:00`).toLocaleDateString() : null}
            />
          </dl>
        </CardContent>
      </Card>

      {dealer.notes && (
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <p className="mb-1 text-sm font-medium">Notes</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{dealer.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AddressesTab({ dealer }: { dealer: PartyPayload }) {
  if (dealer.addresses.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={MapPin}
          title="No address on file"
          description="A delivery challan needs one. Add it from the editor."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {dealer.addresses.map((a) => (
        <Card key={a.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{a.label}</p>
              {a.isDefaultBilling && (
                <StatusPill status="BILLING" tone="info" label="Billing" />
              )}
              {a.isDefaultShipping && (
                <StatusPill status="SHIPPING" tone="info" label="Shipping" />
              )}
            </div>
            <address className="text-sm not-italic text-muted-foreground">
              {[a.line1, a.line2, a.city, a.district].filter(Boolean).join(', ')}
            </address>
            {(a.contactName || a.phone) && (
              <p className="text-sm">{[a.contactName, a.phone].filter(Boolean).join(' · ')}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

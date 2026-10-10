import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Boxes, Clock, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { env } from '@/config/env';
import { MODULES } from '@/config/modules';
import { money } from '@/features/dealers/creditMath';
import { useCan } from '@/hooks/data/useAuth';
import { useDashboard } from '@/hooks/data/useDashboard';
import { useAppSelector } from '@/app/store';

import { ApiStatusCard } from './ApiStatusCard';
import { SalesTrendChart } from './SalesTrendChart';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The dashboard (Day 38). Every figure is the server's, computed by the function behind the report
 * it summarises — so each card links to that report, and the two always agree. A card the user may
 * not see is not drawn at all; a cashier sees their shortcuts, not a wall of zeros.
 */
export function Home() {
  const reduceMotion = useReducedMotion();
  const can = useCan();
  const name = useAppSelector((s) => s.auth.user?.name);
  const { data: d, isLoading } = useDashboard();

  const fadeUp = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: reduceMotion ? 0 : delay, ease: 'easeOut' as const },
  });

  const shortcuts = MODULES.filter((m) => m.path !== '/' && can(m.permission))
    .map((m) => ({
      ...m,
      screens: m.screens.filter((s) => can(s.permission) && !s.comingSoon),
    }))
    .filter((m) => m.screens.length > 0);
  const anyFigures = d && (d.sales || d.receivables || d.lowStock || d.dispatch);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <motion.header {...fadeUp(0)} className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {name ? `Hello, ${name.split(' ')[0]}` : env.appName}
        </h1>
        <p className="text-muted-foreground">
          {d
            ? new Date(`${d.today}T00:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : ' '}
        </p>
      </motion.header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        anyFigures && (
          <motion.section
            {...fadeUp(0.06)}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            aria-label="Key figures"
          >
            {d.sales && (
              <Kpi
                label="Today's sales"
                icon={TrendingUp}
                value={money(d.sales.todayNetMinor)}
                to="/reports/sales"
                hint={
                  <>
                    Wholesale {money(d.sales.todayWholesaleMinor)} · Counter{' '}
                    {money(d.sales.todayCounterMinor)}
                  </>
                }
              />
            )}
            {d.sales && (
              <Kpi
                label="This month"
                icon={TrendingUp}
                value={money(d.sales.monthNetMinor)}
                to="/reports/sales"
                hint="Net of returns, month to date"
              />
            )}
            {d.receivables && (
              <Kpi
                label="Receivables"
                icon={Wallet}
                value={money(d.receivables.totalMinor)}
                to="/receivables/ageing"
                hint="Owed by dealers on open invoices"
              />
            )}
            {d.receivables && (
              <Kpi
                label="Overdue"
                icon={AlertTriangle}
                value={money(d.receivables.overdueMinor)}
                to="/receivables/ageing"
                tone={d.receivables.overdueMinor > 0 ? 'danger' : undefined}
                hint={`${d.receivables.overdueDealers} dealer(s) past their terms`}
              />
            )}
            {d.lowStock && (
              <Kpi
                label="Low stock"
                icon={Boxes}
                value={String(d.lowStock.count)}
                to="/purchase/reorder"
                tone={d.lowStock.count > 0 ? 'warning' : undefined}
                hint="Below reorder point, after what is on order"
              />
            )}
            {d.dispatch && !d.lowStock && (
              <Kpi
                label="Pending dispatch"
                icon={Clock}
                value={String(d.dispatch.pendingOrders)}
                to="/sales/orders"
                hint="Confirmed, not yet fully shipped"
              />
            )}
          </motion.section>
        )
      )}

      {d && anyFigures && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <motion.div {...fadeUp(0.12)} className="space-y-6">
            {d.sales && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Sales, last 30 days</CardTitle>
                  <CardDescription>Net of returns, per day.</CardDescription>
                </CardHeader>
                <CardContent>
                  <SalesTrendChart trend={d.sales.trend} />
                </CardContent>
              </Card>
            )}
            {d.dispatch && (
              <ListCard
                title="Waiting to ship"
                description={`${d.dispatch.pendingOrders} confirmed order(s) not yet fully dispatched — oldest first.`}
                to="/sales/orders"
                empty="Nothing waiting — every confirmed order has shipped."
                items={d.dispatch.oldest.map((o) => ({
                  key: o.id,
                  to: `/sales/orders/${o.id}`,
                  left: (
                    <>
                      <span className="font-mono text-sm">{o.docNo}</span>{' '}
                      <span className="text-muted-foreground">· {o.dealerName}</span>
                      <span className="block text-xs text-muted-foreground">
                        ordered {new Date(o.orderDate).toLocaleDateString()}
                        {o.requiredDate &&
                          ` · needed by ${new Date(o.requiredDate).toLocaleDateString()}`}
                      </span>
                    </>
                  ),
                  right: <StatusPill status={o.status} />,
                }))}
              />
            )}
          </motion.div>

          <motion.aside {...fadeUp(0.18)} className="space-y-6">
            {d.receivables && (
              <ListCard
                title="Overdue"
                description="Dealers past their terms, most overdue first."
                to="/receivables/ageing"
                empty="No one is overdue."
                items={d.receivables.alerts.map((a) => ({
                  key: a.partyId,
                  to: `/dealers/profile/${a.partyId}?tab=ledger`,
                  left: (
                    <>
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-xs text-destructive">
                        {a.oldestDays} day(s) overdue
                      </span>
                    </>
                  ),
                  right: <span className="tabular-nums">{money(a.overdueMinor)}</span>,
                }))}
              />
            )}
            {d.sales && (
              <ListCard
                title="Top dealers this month"
                to="/reports/sales"
                empty="No dealer sales yet this month."
                items={d.sales.topDealers.map((t, i) => ({
                  key: t.partyId,
                  to: `/dealers/profile/${t.partyId}`,
                  left: (
                    <>
                      <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                      <span className="font-medium">{t.name}</span>
                      <span className="block pl-5 text-xs text-muted-foreground">
                        {t.invoices} invoice(s)
                      </span>
                    </>
                  ),
                  right: <span className="tabular-nums">{money(t.netMinor)}</span>,
                }))}
              />
            )}
            {d.lowStock && (
              <ListCard
                title="Low stock"
                to="/purchase/reorder"
                empty="Everything is above its reorder point."
                items={d.lowStock.items.map((x) => ({
                  key: x.productId,
                  to: '/purchase/reorder',
                  left: (
                    <>
                      <span className="font-medium">{x.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {x.sku}
                      </span>
                    </>
                  ),
                  right: (
                    <span className="tabular-nums">
                      <span
                        className={x.positionBase <= 0 ? 'font-medium text-destructive' : ''}
                      >
                        {x.positionBase}
                      </span>
                      <span className="text-muted-foreground"> / {x.reorderPoint}</span>
                    </span>
                  ),
                }))}
              />
            )}
          </motion.aside>
        </div>
      )}

      <motion.section
        {...fadeUp(0.24)}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Go to</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 sm:grid-cols-2">
            {shortcuts.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={mod.key}
                  to={mod.path}
                  className="group flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{mod.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {mod.screens.map((s) => s.label).join(' · ')}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <ApiStatusCard />
      </motion.section>
    </div>
  );
}

function Kpi({
  label,
  icon: Icon,
  value,
  hint,
  to,
  tone,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  hint: ReactNode;
  to: string;
  tone?: 'danger' | 'warning';
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
            {label}
            <Icon className="h-4 w-4" aria-hidden="true" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {value}
            {tone && (
              <Badge
                variant="outline"
                className={`ml-2 align-middle text-xs ${tone === 'danger' ? 'border-destructive/40 text-destructive' : 'border-warning/40 text-warning'}`}
              >
                {tone === 'danger' ? 'act' : 'check'}
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function ListCard({
  title,
  description,
  to,
  empty,
  items,
}: {
  title: string;
  description?: string;
  to: string;
  empty: string;
  items: { key: string; to: string; left: ReactNode; right: ReactNode }[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        <Link to={to} className="shrink-0 text-xs text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          items.map((it) => (
            <Link
              key={it.key}
              to={it.to}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="min-w-0">{it.left}</span>
              <span className="shrink-0">{it.right}</span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

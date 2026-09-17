import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Boxes, Clock, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

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

import { ApiStatusCard } from './ApiStatusCard';

/** Real figures replace these skeletons on Day 38, once the ledgers they read exist. */
const KPIS = [
  { label: "Today's sales", icon: TrendingUp, hint: 'Counter + wholesale', day: 38 },
  { label: 'Receivables', icon: Wallet, hint: 'Outstanding from dealers', day: 38 },
  { label: 'Low stock', icon: Boxes, hint: 'Below reorder point', day: 38 },
  { label: 'Pending dispatch', icon: Clock, hint: 'Confirmed, not yet shipped', day: 38 },
] as const;

export function Home() {
  const reduceMotion = useReducedMotion();

  const fadeUp = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: reduceMotion ? 0 : delay, ease: 'easeOut' as const },
  });

  // Modules with at least one screen, in the order they land, so the home page doubles as a
  // visible build schedule while the system is under construction.
  const upcoming = MODULES.filter((m) => m.screens.length > 0).sort(
    (a, b) => a.landsOnDay - b.landsOnDay,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <motion.header {...fadeUp(0)} className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{env.appName}</h1>
          <Badge variant="outline">Day 1 · setup</Badge>
        </div>
        <p className="text-muted-foreground">
          Wholesale ERP and counter POS for optical products — dealers, bulk orders, dispatch,
          credit and warehouse stock.
        </p>
      </motion.header>

      <motion.section
        {...fadeUp(0.06)}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Key figures"
      >
        {KPIS.map(({ label, icon: Icon, hint, day }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                {label}
                <Icon className="h-4 w-4" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-7 w-24" />
              <p className="text-xs text-muted-foreground">
                {hint} · arrives day {day}
              </p>
            </CardContent>
          </Card>
        ))}
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <motion.section {...fadeUp(0.12)}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">What gets built, and when</CardTitle>
              <CardDescription>
                Each module below lands on its numbered day in WORK-PLAN-DAYS.md.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {upcoming.map((mod) => {
                const Icon = mod.icon;
                return (
                  <Link
                    key={mod.key}
                    to={mod.path}
                    className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
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
                    <Badge variant="secondary" className="shrink-0">
                      day {mod.landsOnDay}
                    </Badge>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </motion.section>

        <motion.aside {...fadeUp(0.18)}>
          <ApiStatusCard />
        </motion.aside>
      </div>
    </div>
  );
}

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Construction, ShieldOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { moduleForPath } from '@/config/modules';
import { useCan } from '@/hooks/data/useAuth';
import { cn } from '@/lib/utils';

/**
 * A module's index page: the screens inside it, as cards.
 *
 * Built from the same registry as the sidebar and filtered by the same permissions, so the
 * cards and the menu always list the same things. A screen the user may not open is **absent**,
 * not greyed out — offering a disabled card for a capability someone lacks tells them nothing
 * useful and invites them to keep clicking it.
 *
 * A screen that has not been built yet *is* shown, marked "coming soon" and not clickable. That
 * is a different statement — "this exists in the plan and is not ready" — and while the system
 * is under construction it is worth saying.
 */
export function ModuleLanding() {
  const { pathname } = useLocation();
  const can = useCan();
  const reduceMotion = useReducedMotion();

  const mod = moduleForPath(pathname);
  if (!mod) return null;

  const screens = mod.screens.filter((screen) => can(screen.permission));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={mod.label} icon={mod.icon} />

      {screens.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            {mod.screens.length === 0 ? (
              <EmptyState
                icon={Construction}
                title="Nothing here yet"
                description={`The screens for ${mod.label} land on day ${mod.landsOnDay} of the work plan.`}
              />
            ) : (
              <EmptyState
                icon={ShieldOff}
                title="No screens available to you"
                description={`${mod.label} exists, but your role opens none of its screens. Ask an administrator if you need access.`}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {screens.map((screen, index) => {
            const card = (
              <Card
                className={cn(
                  'h-full transition-colors',
                  screen.comingSoon
                    ? 'opacity-70'
                    : 'group hover:border-primary/40 hover:bg-accent/40',
                )}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{screen.label}</span>
                    {screen.comingSoon ? (
                      <Badge variant="secondary" className="shrink-0">
                        coming soon
                      </Badge>
                    ) : (
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    )}
                  </CardTitle>
                  <CardDescription>{screen.description}</CardDescription>
                </CardHeader>

                <CardContent>
                  <code className="text-xs text-muted-foreground">{screen.permission}</code>
                </CardContent>
              </Card>
            );

            return (
              <motion.div
                key={screen.path}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: reduceMotion ? 0 : index * 0.04 }}
              >
                {screen.comingSoon ? (
                  card
                ) : (
                  <Link
                    to={screen.path}
                    className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {card}
                  </Link>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

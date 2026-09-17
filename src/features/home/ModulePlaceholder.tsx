import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MODULES } from '@/config/modules';

/**
 * Stand-in for a module whose screens have not been built yet.
 *
 * Replaced module by module as the day plan progresses — each module's real landing page
 * renders its own card grid from the same `MODULES` registry.
 */
export function ModulePlaceholder() {
  const { pathname } = useLocation();
  const mod = MODULES.find((m) => m.path === pathname);

  if (!mod) return null;
  const Icon = mod.icon;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{mod.label}</h1>
          <p className="text-sm text-muted-foreground">
            {/* Scheduled for day {mod.landsOnDay} of the work plan. */}
          </p>
        </div>
      </header>

      {mod.screens.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {mod.screens.map((screen) => (
            <Card key={screen.path}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  {screen.label}
                  {screen.comingSoon && <Badge variant="secondary">coming soon</Badge>}
                </CardTitle>
                <CardDescription>{screen.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <code className="text-xs text-muted-foreground">{screen.permission}</code>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Construction className="h-5 w-5" />
            Screens for this module are defined in the work plan and land on day{' '}
            {mod.landsOnDay}.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

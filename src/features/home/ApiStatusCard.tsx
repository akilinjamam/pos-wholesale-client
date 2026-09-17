import { AlertTriangle, CheckCircle2, Database, RefreshCw, XCircle } from 'lucide-react';

import { errorMessage } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useHealth } from '@/hooks/data/useHealth';
import { cn } from '@/lib/utils';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/**
 * Live API + database status.
 *
 * The replica-set row is the reason this card exists at all. Mongoose transactions only work
 * against a replica set, and every atomic operation in this system — stock movements, ledger
 * postings, document numbering — depends on them. Against a standalone mongod they fail at
 * runtime on the first sale, not at startup. Surfacing it on the first screen means a broken
 * environment is obvious on day one rather than during a demo.
 */
export function ApiStatusCard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useHealth();

  const reachable = !isError && !!data;
  const transactionsReady = data?.db.replicaSet === true && data.db.state === 'connected';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            System status
          </CardTitle>
          <CardDescription>Live connection to the API and database</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void refetch()}
          title="Refresh now"
          disabled={isFetching}
        >
          <RefreshCw className={cn(isFetching && 'animate-spin')} />
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : isError || !data ? (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-destructive">API unreachable</p>
              <p className="text-muted-foreground">{errorMessage(error)}</p>
              <p className="text-muted-foreground">
                Start it with <code className="rounded bg-muted px-1">npm run dev</code> in{' '}
                <code className="rounded bg-muted px-1">pos-whole-sale-server</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            <Row label="API">
              <Badge variant={reachable ? 'success' : 'destructive'}>
                {reachable ? 'Connected' : 'Unreachable'}
              </Badge>
            </Row>
            <Row label="Environment">
              <span className="capitalize">{data.environment}</span>
            </Row>
            <Row label="Database">
              <span className="font-mono text-xs">{data.db.name}</span>
            </Row>
            <Row label="Connection">
              <Badge variant={data.db.state === 'connected' ? 'success' : 'destructive'}>
                {data.db.state}
              </Badge>
            </Row>
            <Row label="MongoDB">
              <span className="font-mono text-xs">{data.db.version ?? '—'}</span>
            </Row>
            <Row label="Replica set">
              {data.db.replicaSet ? (
                <Badge variant="success" className="font-mono">
                  {data.db.replicaSetName ?? 'yes'}
                </Badge>
              ) : (
                <Badge variant="destructive">missing</Badge>
              )}
            </Row>
            <Row label="Uptime">
              <span className="tabular">{data.uptimeSeconds}s</span>
            </Row>

            <div className="pt-3">
              {transactionsReady ? (
                <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <p>
                    Transactions available — atomic stock, ledger and numbering will work.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="space-y-1">
                    <p className="font-medium">MongoDB is not a replica set</p>
                    <p className="text-muted-foreground">
                      Transactions will fail, breaking stock movements, ledger postings and
                      document numbering. Run{' '}
                      <code className="rounded bg-muted px-1">docker compose up -d</code> in the{' '}
                      <code className="rounded bg-muted px-1">pos-wholesale</code> folder.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useReconcile } from '@/hooks/data/useStock';

import { signed } from './inventoryFormat';

import type { ReconcileDriftPayload } from '@shared/types';

/**
 * Run `stock:reconcile` and show the answer.
 *
 * It re-sums the ledger and compares every cached balance, lot balance and serial count against
 * it. The expected answer is **zero drift** — the stock engine writes both in one transaction — so
 * anything listed here is a bug or a hand edit to the database, and the report says exactly where.
 * It never repairs: fixing the number would erase the evidence of what broke it.
 */
export function ReconcileDialog({
  open,
  onClose,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  locationId?: string;
}) {
  const reconcile = useReconcile();
  const { mutate } = reconcile;

  // Runs once per opening; the dialog is remounted per open by its parent.
  useEffect(() => {
    if (open) mutate(locationId);
  }, [open, locationId, mutate]);

  const r = reconcile.data;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reconcile stock"
      description="Re-sums the ledger and checks every balance, lot and serial count against it."
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => mutate(locationId)}
            disabled={reconcile.isPending}
          >
            Run again
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {reconcile.isPending || !r ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Re-summing the ledger…
        </p>
      ) : (
        <div className="space-y-4" aria-live="polite">
          {r.clean ? (
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
              <div>
                <p className="font-medium">No drift</p>
                <p className="text-sm text-muted-foreground">
                  All {r.counts.balances} balance row(s) and {r.counts.lots} lot balance(s)
                  agree with the ledger exactly, and every serial-tracked shelf holds as many
                  units as the register lists.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <TriangleAlert className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
              <div>
                <p className="font-medium text-destructive">Drift found</p>
                <p className="text-sm text-muted-foreground">
                  The rows below disagree with the ledger. Nothing has been changed — report
                  them; the ledger is the record of what really moved.
                </p>
              </div>
            </div>
          )}
          <DriftTable title="Balances" rows={r.balanceDrift} what={(d) => d.sku} />
          <DriftTable title="Lots" rows={r.lotDrift} what={(d) => `Lot ${d.lotNo}`} />
          <DriftTable
            title="Serial counts"
            rows={r.serialDrift}
            what={(d) => d.sku}
            expectedLabel="In register"
          />
          <p className="text-xs text-muted-foreground">
            Checked {new Date(r.checkedAt).toLocaleString()} in {r.tookMs} ms —{' '}
            {r.counts.ledgerGroups} ledger group(s).
          </p>
        </div>
      )}
    </Dialog>
  );
}

function DriftTable({
  title,
  rows,
  what,
  expectedLabel = 'Ledger says',
}: {
  title: string;
  rows: ReconcileDriftPayload[];
  what: (d: ReconcileDriftPayload) => string | undefined;
  expectedLabel?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">{expectedLabel}</TableHead>
              <TableHead className="text-right">Balance shows</TableHead>
              <TableHead className="text-right">Drift</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.key}>
                <TableCell className="font-mono text-xs">{what(d)}</TableCell>
                <TableCell>{d.locationCode}</TableCell>
                <TableCell className="text-right tabular-nums">{d.expected}</TableCell>
                <TableCell className="text-right tabular-nums">{d.actual}</TableCell>
                <TableCell className="text-right font-medium tabular-nums text-destructive">
                  {signed(d.drift)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

import { RotateCcw, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtDate, fmtDateTime } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { cn } from '@/lib/utils';

import { allocatedMinor, rowProblem } from './allocation';

import type { ApplyState } from './allocation';
import type { OpenInvoicePayload } from '@shared/types';

/**
 * The editable allocation grid — receipt entry and spending an advance (Day 29).
 *
 * One row per open invoice, oldest due first, each with how much of *this* money goes to it. It
 * opens on the server's oldest-due-first proposal; the person taking the money changes it when the
 * dealer says "this one, not that one". What is not allocated is shown as the advance it becomes.
 */
export interface GridLabels {
  doc: string;
  owes: string;
  nothingOpen: string;
  restGoes: string;
  moneyVerb: string;
  leftover: string;
}

const RECEIPT_LABELS: GridLabels = {
  doc: 'Invoice',
  owes: 'Owes',
  nothingOpen: 'Nothing open — the whole amount goes on account as an advance.',
  restGoes: 'stays on account',
  moneyVerb: 'received',
  leftover: 'On account',
};

export function AllocationGrid({
  invoices,
  apply,
  onChange,
  amountMinor,
  errors,
  onResetToFifo,
  disabled,
  labels = RECEIPT_LABELS,
}: {
  invoices: OpenInvoicePayload[];
  apply: ApplyState;
  onChange: (next: ApplyState) => void;
  /** The money being allocated: the receipt, or what is left on an advance. */
  amountMinor: number;
  /** Server errors keyed by invoice id. */
  errors: Record<string, string>;
  onResetToFifo: () => void;
  disabled?: boolean;
  /** The supplier payment screen (Day 35) settles bills, not invoices. */
  labels?: GridLabels;
}) {
  const allocated = allocatedMinor(invoices, apply);
  const over = allocated > amountMinor;

  if (invoices.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {labels.nothingOpen}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Oldest due first. Change any amount — the rest {labels.restGoes}.
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetToFifo}
            disabled={disabled}
          >
            <RotateCcw aria-hidden="true" />
            Oldest first
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({})}
            disabled={disabled}
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.doc}</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">{labels.owes}</TableHead>
              <TableHead className="w-36 text-right">Apply</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const problem = errors[inv.id] ?? rowProblem(inv, apply[inv.id]);
              return (
                <TableRow key={inv.id}>
                  <TableCell>
                    <span className="font-mono text-sm">{inv.docNo}</span>
                    {inv.docNo.startsWith('OB-') && (
                      <Badge variant="outline" className="ml-2 py-0">
                        opening
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(inv.invoiceDate)}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtDate(inv.dueDate)}
                    {inv.daysOverdue !== null && inv.daysOverdue > 0 && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-destructive/40 py-0 text-destructive"
                      >
                        {inv.daysOverdue}d overdue
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(inv.grandTotalMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(inv.balanceMinor)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={apply[inv.id] ?? ''}
                      placeholder="0"
                      disabled={disabled}
                      onChange={(e) => onChange({ ...apply, [inv.id]: e.target.value })}
                      aria-invalid={Boolean(problem)}
                      aria-label={`Apply to ${inv.docNo}`}
                      className="h-8 text-right tabular-nums"
                    />
                    {problem && <p className="mt-0.5 text-xs text-destructive">{problem}</p>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm tabular-nums">
        <span>
          Allocated{' '}
          <strong className={cn(over && 'text-destructive')}>{money(allocated)}</strong>
        </span>
        <span>
          {over ? (
            <strong className="text-destructive">
              {money(allocated - amountMinor)} more than {labels.moneyVerb}
            </strong>
          ) : (
            <>
              {labels.leftover} <strong>{money(amountMinor - allocated)}</strong>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

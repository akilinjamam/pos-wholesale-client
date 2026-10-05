import { fromMinor, toMinor } from '@shared/money';

import type { AllocationInput } from '@shared/payments';
import type { AllocationPreview, OpenInvoicePayload } from '@shared/types';

/**
 * The allocation grid's state and conversions (Day 29).
 *
 * The grid holds what the person typed, per invoice, in taka — strings, so a half-typed "12."
 * survives a re-render. It starts from the server's oldest-due-first proposal; whatever is sent
 * back is validated by the server again, against the invoices as they are at that moment.
 */

/** invoiceId → taka as typed. */
export type ApplyState = Record<string, string>;

export const fromPlan = (plan: AllocationPreview['allocations']): ApplyState =>
  Object.fromEntries(plan.map((a) => [a.invoiceId, String(fromMinor(a.amountMinor))]));

const minorOf = (typed: string | undefined): number => {
  const n = Number(typed);
  return typed && Number.isFinite(n) && n > 0 ? toMinor(n) : 0;
};

/**
 * The rows with an amount, in the grid's order, as the API's allocations. `invoiceIds[i]` says
 * which invoice `allocations.i` is — how a server error on `allocations.2.amountMinor` finds its row.
 */
export function toAllocations(
  invoices: readonly OpenInvoicePayload[],
  apply: ApplyState,
): { allocations: AllocationInput[]; invoiceIds: string[] } {
  const allocations: AllocationInput[] = [];
  for (const inv of invoices) {
    const amountMinor = minorOf(apply[inv.id]);
    if (amountMinor > 0) allocations.push({ invoiceId: inv.id, amountMinor });
  }
  return { allocations, invoiceIds: allocations.map((a) => a.invoiceId) };
}

export function allocatedMinor(
  invoices: readonly OpenInvoicePayload[],
  apply: ApplyState,
): number {
  return toAllocations(invoices, apply).allocations.reduce((t, a) => t + a.amountMinor, 0);
}

/** Per-invoice problems the grid can see before sending — the server checks them all again. */
export function rowProblem(inv: OpenInvoicePayload, typed: string | undefined): string | null {
  if (typed && (!Number.isFinite(Number(typed)) || Number(typed) < 0)) return 'Not an amount';
  return minorOf(typed) > inv.balanceMinor ? 'More than it owes' : null;
}

/** Server field errors (`allocations.i.field`) mapped onto invoice rows. */
export function errorsByInvoice(
  fields: { path: string; message: string }[],
  invoiceIds: readonly string[],
): { byInvoice: Record<string, string>; general: string[] } {
  const byInvoice: Record<string, string> = {};
  const general: string[] = [];
  for (const f of fields) {
    const m = /^allocations\.(\d+)\./.exec(f.path);
    const id = m ? invoiceIds[Number(m[1])] : undefined;
    if (id) byInvoice[id] = f.message;
    else general.push(f.message);
  }
  return { byInvoice, general };
}

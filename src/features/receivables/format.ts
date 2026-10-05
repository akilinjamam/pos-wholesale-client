import { money } from '@/features/dealers/creditMath';

/** A balance as the dealer reads it: what they owe, or — marked "Cr" — what we owe them. */
export const balanceText = (minor: number) =>
  minor < 0 ? `${money(-minor)} Cr` : money(minor);

/** Ledger document types as a statement prints them. */
const DOC_LABEL: Record<string, string> = {
  OPENING: 'Opening balance',
  INVOICE: 'Invoice',
  RECEIPT: 'Receipt',
  PAYMENT: 'Payment',
  CREDIT_NOTE: 'Credit note',
  DEBIT_NOTE: 'Debit note',
  ADJUSTMENT: 'Adjustment',
  CHEQUE_BOUNCE: 'Cheque bounced',
  WRITE_OFF: 'Write-off',
};
export const docLabel = (t: string) => DOC_LABEL[t] ?? t;

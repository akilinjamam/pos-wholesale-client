import { FileText } from 'lucide-react';

import { PageHeader } from '@/components/common/PageHeader';

import { InvoicesTable } from './InvoicesTable';

/** Billing → Invoices (Day 36b): every invoice, both channels — find one, open it, reprint it. */
export function InvoicesList() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        icon={FileText}
        description="Wholesale and counter invoices — what each was for, what has been paid, and what is still owed."
      />
      <InvoicesTable />
    </div>
  );
}

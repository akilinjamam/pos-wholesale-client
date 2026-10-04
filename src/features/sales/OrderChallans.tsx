import { Truck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusPill } from '@/components/common/StatusPill';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDispatches } from '@/hooks/data/useDispatches';

/**
 * An order's challans — each consignment, its status, and the invoice it raised. Partial dispatch
 * makes this a list: two challans, two invoices, each for exactly what was in its boxes.
 */
export function OrderChallans({ orderId }: { orderId: string }) {
  const { data } = useDispatches({ orderId, limit: 50, sort: 'createdAt', order: 'asc' });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4" aria-hidden="true" />
          Challans
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {items.map((d) => (
            <li key={d.id} className="py-2">
              <Link
                to={`/dispatch/challans/${d.id}`}
                className="flex items-center justify-between gap-2 hover:underline"
              >
                <span className="font-mono">
                  {d.docNo ?? (d.status === 'PACKED' ? 'Packed' : 'Pick list')}
                </span>
                <StatusPill status={d.status} />
              </Link>
              <p className="text-xs text-muted-foreground">
                {d.lines.reduce((s, l) => s + l.qtyBase, 0)} units
                {d.invoiceDocNo && ` · invoice ${d.invoiceDocNo}`}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

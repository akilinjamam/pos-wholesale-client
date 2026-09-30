import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { useAppSelector } from '@/app/store';
import { EmptyState } from '@/components/common/EmptyState';
import { useCan } from '@/hooks/data/useAuth';
import { useOrder } from '@/hooks/data/useOrders';

import { OrderBuilder } from './OrderBuilder/OrderBuilder';
import { emptyBuilder, fromOrder } from './OrderBuilder/orderBuilder';
import { OrderView } from './OrderView';

/**
 * `/sales/orders/new` — an empty builder, defaulting to the warehouse the user works in.
 */
export function NewOrderPage() {
  const activeLocationId = useAppSelector((s) => s.ui.activeLocationId);
  return <OrderBuilder order={null} initial={emptyBuilder(activeLocationId)} />;
}

/**
 * `/sales/orders/:id` — a draft the caller may edit opens in the builder; anything else (or a
 * draft they may only read) opens read-only. The status decides, so confirming a draft turns this
 * same page into the confirmed order's view without a navigation.
 */
export function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const order = useOrder(id);
  const editable = order.data?.status === 'DRAFT' && can('order:update');

  // The builder's starting state, loaded once per visit: the dealer's full record and each line's
  // product. Keyed by id alone — re-seeding on every save would wipe what the user is typing.
  const initial = useQuery({
    queryKey: ['orders', 'builder', id],
    queryFn: () => fromOrder(order.data!),
    enabled: editable,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  if (order.isPending || (editable && initial.isPending)) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (!order.data) {
    return (
      <EmptyState
        title="Order not found"
        description="It may have been removed, or be at a warehouse you do not work at."
      />
    );
  }
  if (editable && initial.data) {
    return <OrderBuilder key={order.data.id} order={order.data} initial={initial.data} />;
  }
  return <OrderView order={order.data} />;
}

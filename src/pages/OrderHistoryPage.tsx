import { ClipboardList } from 'lucide-react';
import { Button, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui';
import OrderCard from '@/components/OrderCard';
import { useAccount } from '@/context/auth';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Order } from '@/lib/types';

export default function OrderHistoryPage() {
  const { profile } = useAccount();

  const { data, error, loading, reload } = useLoad(
    async () =>
      unwrap<Order[]>(
        await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200)
      ),
    [profile.id]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Orders"
        title="Order History"
        description="Everything you have bought and sold, with its current status."
      />
      {loading && <Spinner label="Loading orders" />}
      {error && (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState icon={ClipboardList} title="No orders yet" text="Purchases and sales will be listed here." />
      )}
      {data && data.length > 0 && (
        <div className="space-y-4">
          {data.map((order) => (
            <OrderCard key={order.id} order={order} role={order.buyer_id === profile.id ? 'buyer' : 'seller'} />
          ))}
        </div>
      )}
    </div>
  );
}

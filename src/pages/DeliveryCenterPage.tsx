import { useState, type FormEvent } from 'react';
import { MessageCircle, Send, Truck } from 'lucide-react';
import { Button, EmptyState, Field, Notice, PageHeader, Spinner, inputClass } from '@/components/ui';
import OrderCard from '@/components/OrderCard';
import { useAccount } from '@/context/auth';
import { getErrorMessage } from '@/lib/errors';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Order } from '@/lib/types';
import type { PageId } from '@/lib/navigation';

type DeliveryData = {
  seller: Order[];
  buyer: Order[];
};

export default function DeliveryCenterPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { profile } = useAccount();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, error: loadError, loading, reload } = useLoad(
    async (): Promise<DeliveryData> => {
      const [sellerResult, buyerResult] = await Promise.all([
        supabase.from('orders').select('*').eq('seller_id', profile.id).order('created_at', { ascending: false }).limit(200),
        supabase.from('orders').select('*').eq('buyer_id', profile.id).order('created_at', { ascending: false }).limit(200),
      ]);
      return {
        seller: unwrap<Order[]>(sellerResult),
        buyer: unwrap<Order[]>(buyerResult),
      };
    },
    [profile.id]
  );

  const handleDeliver = async (e: FormEvent<HTMLFormElement>, orderId: string) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('mark_order_delivered', { p_order_id: orderId, p_note: note });
    setSaving(false);
    if (rpcError) {
      setError(getErrorMessage(rpcError));
      return;
    }
    setOpenId(null);
    setNote('');
    reload();
  };

  const sellerOrders = data?.seller ?? [];
  const buyerOrders = data?.buyer ?? [];
  const pending = sellerOrders.filter((order) => order.status === 'escrow');
  const previous = sellerOrders.filter((order) => order.status !== 'escrow');

  return (
    <div>
      <PageHeader eyebrow="Orders" title="Delivery Center" description="Track what you ordered and deliver products to your buyers. Payment is released once delivery is confirmed." />
      {error && <div className="mb-6"><Notice tone="error">{error}</Notice></div>}
      {loading && <Spinner label="Loading deliveries" />}
      {loadError && <div className="space-y-3"><Notice tone="error">{loadError}</Notice><Button variant="secondary" onClick={reload}>Try again</Button></div>}

      {!loading && !loadError && (
        <>
          {buyerOrders.length > 0 && (
            <section className="mb-10 space-y-4">
              <div><h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">Your purchases</h2><p className="mt-1 text-sm text-zinc-500">Delivered items and access details appear inside each order.</p></div>
              {buyerOrders.map((order) => <OrderCard key={order.id} order={order} role="buyer"><Button variant="secondary" onClick={() => onNavigate('messages')}><MessageCircle className="h-4 w-4" aria-hidden /> Message seller</Button></OrderCard>)}
            </section>
          )}

          {pending.length > 0 && (
            <section className="mb-10 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">Awaiting delivery</h2>
              {pending.map((order) => (
                <OrderCard key={order.id} order={order} role="seller">
                  {openId === order.id ? (
                    <form onSubmit={(event) => handleDeliver(event, order.id)} className="w-full space-y-3">
                      <Field label="Delivery details" hint="Download link, access instructions or a message for the buyer."><textarea className={`${inputClass} min-h-[96px] resize-y`} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
                      <div className="flex gap-3"><Button type="submit" loading={saving}><Send className="h-4 w-4" aria-hidden /> Mark delivered</Button><Button variant="ghost" type="button" onClick={() => setOpenId(null)}>Cancel</Button></div>
                    </form>
                  ) : <><Button onClick={() => setOpenId(order.id)}><Truck className="h-4 w-4" aria-hidden /> Deliver order</Button><Button variant="secondary" onClick={() => onNavigate('messages')}><MessageCircle className="h-4 w-4" aria-hidden /> Message buyer</Button></>}
                </OrderCard>
              ))}
            </section>
          )}

          {previous.length > 0 && <section className="space-y-4"><h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Previous deliveries</h2>{previous.map((order) => <OrderCard key={order.id} order={order} role="seller"><Button variant="secondary" onClick={() => onNavigate('messages')}><MessageCircle className="h-4 w-4" aria-hidden /> Message buyer</Button></OrderCard>)}</section>}
          {buyerOrders.length === 0 && sellerOrders.length === 0 && <EmptyState icon={Truck} title="No deliveries yet" text="Your purchases and seller deliveries will appear here." />}
        </>
      )}
    </div>
  );
}

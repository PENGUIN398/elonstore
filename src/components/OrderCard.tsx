import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { formatDateTime, formatMoney } from '@/lib/format';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/listings';
import type { Order } from '@/lib/types';

export default function OrderCard({
  order,
  role,
  children,
}: {
  order: Order;
  role: 'buyer' | 'seller';
  children?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 transition-colors duration-200 hover:border-zinc-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
            <span className="text-xs text-zinc-500">{role === 'buyer' ? 'Purchased' : 'Sold'} {formatDateTime(order.created_at)}</span>
          </div>
          <h3 className="truncate text-base font-semibold text-zinc-100">{order.listing_title}</h3>
          <p className="text-xs text-zinc-500">Order {order.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums text-zinc-100">{formatMoney(order.amount_cents)}</p>
      </div>

      {order.delivery_note && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Delivery details</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-300">{order.delivery_note}</p>
        </div>
      )}

      {children && <div className="mt-4 flex flex-wrap gap-3">{children}</div>}
    </article>
  );
}

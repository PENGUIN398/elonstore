import { Zap } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { Listing } from '@/lib/types';

export default function ServiceCard({ listing, onOpen }: { listing: Listing; onOpen: (listing: Listing) => void }) {
  const sellerName = listing.seller?.display_name || listing.seller?.handle || 'Seller';
  const sellerInitials = sellerName.slice(0, 2).toUpperCase();
  const orders = listing.seller?.sales_count ?? 0;
  const isHourly = listing.pricing_model === 'hourly';
  const deliveryLabel =
    listing.delivery_days === null
      ? 'Flexible delivery'
      : listing.delivery_days === 0
        ? 'Same-day delivery'
        : `${listing.delivery_days}d delivery`;

  return (
    <button
      type="button"
      onClick={() => onOpen(listing)}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-xl hover:shadow-emerald-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
    >
      <div className="flex items-center gap-3">
        {listing.seller?.avatar_url ? (
          <img
            src={listing.seller.avatar_url}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full border border-zinc-700 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-sm font-bold text-emerald-300">
            {sellerInitials}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{sellerName}</p>
          <p className="text-xs text-zinc-500">
            {orders} {orders === 1 ? 'order' : 'orders'} · Since {listing.seller?.seller_since_year ?? 2018}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-zinc-100">{listing.title}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">
          {listing.description || 'No description provided.'}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-zinc-300">
          <Zap className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
          {deliveryLabel}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-zinc-800 pt-4">
        <p className="text-xl font-bold tabular-nums text-zinc-50">
          {formatMoney(listing.price_cents)}
          <span className="ml-1 text-sm font-medium text-zinc-400">/ {isHourly ? 'hour' : 'fixed'}</span>
        </p>
      </div>

      <span className="flex w-full items-center justify-center rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-sm shadow-emerald-500/10 transition-colors duration-200 group-hover:bg-emerald-300">
        Buy
      </span>
    </button>
  );
}

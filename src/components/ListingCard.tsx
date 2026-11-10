import { BadgeCheck, Clock, Package, Zap } from 'lucide-react';
import ServiceCard from '@/components/ServiceCard';
import { Badge } from '@/components/ui';
import { formatCountdown, formatMoney } from '@/lib/format';
import { effectivePrice, isFlashActive } from '@/lib/listings';
import { useNow } from '@/lib/hooks';
import type { Listing } from '@/lib/types';

type CardProps = { listing: Listing; onOpen: (listing: Listing) => void };

export default function ListingCard(props: CardProps) {
  return props.listing.kind === 'service' ? <ServiceCard {...props} /> : <ProductCard {...props} />;
}

function ProductCard({ listing, onOpen }: CardProps) {
  const now = useNow(1000);
  const flash = isFlashActive(listing, now);
  const price = effectivePrice(listing, now);
  const soldOut = listing.stock < 1;
  const sellerName = listing.seller ? listing.seller.display_name || listing.seller.handle : 'elonstore';

  return (
    <button
      type="button"
      onClick={() => onOpen(listing)}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 text-left transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-xl hover:shadow-emerald-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-800">
        {listing.image_url ? (
          <img
            src={listing.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600">
            <Package className="h-10 w-10" aria-hidden />
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {flash && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-semibold text-zinc-950">
              <Zap className="h-3 w-3" aria-hidden />
              Flash
            </span>
          )}
          {soldOut && <Badge tone="error">Sold out</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{listing.category}</p>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-zinc-100">{listing.title}</h3>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {listing.seller?.avatar_url ? (
              <img src={listing.seller.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : null}
            <span className="flex items-center gap-1">by {sellerName}{listing.seller && listing.seller.sales_count > 1100 && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />}</span>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p className="text-lg font-bold tabular-nums text-emerald-300">{formatMoney(price)}</p>
            {flash && (
              <p className="text-xs tabular-nums text-zinc-500 line-through">{formatMoney(listing.price_cents)}</p>
            )}
          </div>
          {flash && listing.flash_ends_at ? (
            <span className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-amber-300">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatCountdown(listing.flash_ends_at, now)}
            </span>
          ) : (
            <span className="text-xs text-zinc-500">{soldOut ? 'No stock' : `${listing.stock} left`}</span>
          )}
        </div>
      </div>
    </button>
  );
}

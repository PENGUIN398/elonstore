import { useState } from 'react';
import { BadgeCheck, CheckCircle2, ShoppingBag } from 'lucide-react';
import { Badge, Button, Modal, Notice } from '@/components/ui';
import { useAccount } from '@/context/auth';
import { formatMoney, formatCountdown } from '@/lib/format';
import { effectivePrice, isFlashActive } from '@/lib/listings';
import { getErrorMessage } from '@/lib/errors';
import { useNow } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Listing } from '@/lib/types';
import type { PageId } from '@/lib/navigation';

type Props = {
  listing: Listing | null;
  onClose: () => void;
  onPurchased: () => void;
  onNavigate: (page: PageId) => void;
};

export default function ListingDetailModal({ listing, onClose, onPurchased, onNavigate }: Props) {
  const { profile, balanceCents, refreshAccount } = useAccount();
  const now = useNow(1000);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleClose = () => {
    setError(null);
    setDone(false);
    onClose();
  };

  const handleBuy = async () => {
    if (!listing) return;
    setBuying(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('purchase_listing', { p_listing_id: listing.id });
    if (rpcError) {
      setError(getErrorMessage(rpcError, 'We could not complete this purchase.'));
      setBuying(false);
      return;
    }
    await refreshAccount();
    setBuying(false);
    setDone(true);
    onPurchased();
  };

  if (!listing) return null;

  const flash = isFlashActive(listing, now);
  const price = effectivePrice(listing, now);
  const isOwn = listing.seller_id === profile.id;
  const canAfford = balanceCents >= price;
  const soldOut = listing.stock < 1;
  const sellerName = listing.seller ? listing.seller.display_name || listing.seller.handle : 'elonstore';

  return (
    <Modal open={!!listing} title={listing.title} onClose={handleClose} wide>
      <div className="space-y-6">
        {listing.image_url && (
          <img src={listing.image_url} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge>{listing.category}</Badge>
          {flash && <Badge tone="warning">Flash sale</Badge>}
          {soldOut && <Badge tone="error">Sold out</Badge>}
        </div>

        <p className="text-sm leading-relaxed text-zinc-300">
          {listing.description || 'No description provided.'}
        </p>

        {listing.kind === 'service' && (
          <p className="text-sm text-zinc-400">
            {listing.pricing_model === 'hourly' ? 'Hourly rate' : 'Fixed price'}
            {listing.delivery_days !== null && ` · Delivery in ${listing.delivery_days} day${listing.delivery_days === 1 ? '' : 's'}`}
          </p>
        )}

        <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Price</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-300">{formatMoney(price)}</p>
            {flash && <p className="text-xs tabular-nums text-zinc-500 line-through">{formatMoney(listing.price_cents)}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Seller</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-semibold text-zinc-100">{sellerName}{listing.seller && listing.seller.sales_count > 1100 && <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />}</p>
          </div>
        </div>

        {done && (
          <Notice tone="success">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Purchase complete. Your funds are held in escrow until you confirm delivery on the Escrow page.
            </span>
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {!done && !isOwn && !soldOut && !canAfford && (
          <Notice tone="info">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Your balance is {formatMoney(balanceCents)}. Add funds to buy this.</span>
              <Button
                variant="secondary"
                className="shrink-0 px-3 py-2 text-xs"
                onClick={() => {
                  onClose();
                  onNavigate('deposit');
                }}
              >
                Add funds
              </Button>
            </div>
          </Notice>
        )}
        {isOwn && <Notice tone="info">This is your listing, so you cannot buy it.</Notice>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={handleClose}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button
              onClick={handleBuy}
              loading={buying}
              disabled={isOwn || soldOut || !canAfford}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Buy for {formatMoney(price)}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

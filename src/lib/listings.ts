import type { Listing, OrderStatus } from '@/lib/types';

export const LISTING_SELECT = '*, seller:profiles!listings_seller_id_fkey(id, handle, display_name, avatar_url, sales_count, seller_since_year)';

export function isFlashActive(listing: Listing, now: number): boolean {
  return (
    listing.flash_price_cents !== null &&
    listing.flash_ends_at !== null &&
    new Date(listing.flash_ends_at).getTime() > now
  );
}

export function effectivePrice(listing: Listing, now: number): number {
  return isFlashActive(listing, now) && listing.flash_price_cents !== null
    ? listing.flash_price_cents
    : listing.price_cents;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  escrow: 'In escrow',
  delivered: 'Delivered',
  completed: 'Completed',
  refunded: 'Refunded',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  escrow: 'warning',
  delivered: 'info',
  completed: 'success',
  refunded: 'neutral',
};

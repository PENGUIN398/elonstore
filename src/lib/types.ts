export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  is_seller: boolean;
  sales_count: number;
  seller_since_year: number;
  created_at: string;
};

export const PROFILE_SELECT = 'id, handle, display_name, bio, is_seller, sales_count, created_at, seller_since_year, avatar_url';

export type Listing = {
  id: string;
  seller_id: string | null;
  title: string;
  description: string;
  category: string;
  image_url: string | null;
  price_cents: number;
  flash_price_cents: number | null;
  flash_ends_at: string | null;
  stock: number;
  is_active: boolean;
  created_at: string;
  kind: 'product' | 'service';
  pricing_model: 'fixed' | 'hourly' | null;
  delivery_days: number | null;
  seller?: Pick<Profile, 'id' | 'handle' | 'display_name' | 'avatar_url' | 'sales_count' | 'seller_since_year'> | null;
};

export type OrderStatus = 'escrow' | 'delivered' | 'completed' | 'refunded';

export type Order = {
  id: string;
  buyer_id: string;
  seller_id: string | null;
  listing_id: string | null;
  listing_title: string;
  amount_cents: number;
  status: OrderStatus;
  delivery_note: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type TransactionKind =
  | 'deposit'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'purchase'
  | 'refund'
  | 'sale'
  | 'escrow_fund'
  | 'escrow_from_binance';

export type Transaction = {
  id: string;
  user_id: string;
  kind: TransactionKind;
  amount_cents: number;
  description: string;
  created_at: string;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  published_at: string;
};

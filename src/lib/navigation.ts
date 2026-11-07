import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  Banknote,
  BadgeCheck,
  ClipboardList,
  Newspaper,
  Package,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wallet,
  Zap,
  MessageCircle,
  Inbox,
} from 'lucide-react';

export type PageId =
  | 'balance'
  | 'activity'
  | 'marketplace'
  | 'sellers'
  | 'seller-profile'
  | 'my-sales'
  | 'flash-sale'
  | 'deposit'
  | 'transfer'
  | 'withdraw'
  | 'escrow'
  | 'order-history'
  | 'delivery-center'
  | 'news'
  | 'support'
  | 'messages'
  | 'inbox'
  | 'payment-reviews';

export type NavItem = {
  id: PageId;
  label: string;
  icon: LucideIcon;
  supportAgentOnly?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { id: 'balance', label: 'Balance', icon: Wallet },
      { id: 'activity', label: 'My Activity', icon: Activity },
      { id: 'marketplace', label: 'Marketplace', icon: Store },
      { id: 'sellers', label: 'Sellers', icon: Users },
      { id: 'seller-profile', label: 'My Seller Profile', icon: BadgeCheck },
      { id: 'my-sales', label: 'My Sales', icon: Package },
      { id: 'flash-sale', label: 'Flash Sale', icon: Zap },
    ],
  },
  {
    label: 'Wallet',
    items: [
      { id: 'deposit', label: 'Deposit', icon: ArrowDownToLine },
      { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
      { id: 'withdraw', label: 'Withdraw', icon: Banknote },
    ],
  },
  {
    label: 'Orders',
    items: [
      { id: 'escrow', label: 'Escrow', icon: ShieldCheck },
      { id: 'order-history', label: 'Order History', icon: ClipboardList },
      { id: 'delivery-center', label: 'Delivery Center', icon: Truck },
    ],
  },
  {
    label: 'Info',
    items: [
      { id: 'news', label: 'News', icon: Newspaper },
      { id: 'support', label: 'Support & disputes', icon: MessageCircle },
      { id: 'messages', label: 'Order messages', icon: MessageCircle },
      { id: 'inbox', label: 'Customer inbox', icon: Inbox, supportAgentOnly: true },
      { id: 'payment-reviews', label: 'Payment reviews', icon: ClipboardList, supportAgentOnly: true },
    ],
  },
];

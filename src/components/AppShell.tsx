import { useEffect, useState, type ComponentType } from 'react';
import { LogOut, Menu, ShoppingCart, Store, UserRound, X } from 'lucide-react';
import { useAccount } from '@/context/auth';
import { NAV_GROUPS, type PageId } from '@/lib/navigation';
import { formatMoney } from '@/lib/format';
import BalancePage from '@/pages/BalancePage';
import ActivityPage from '@/pages/ActivityPage';
import MarketplacePage from '@/pages/MarketplacePage';
import SellersPage from '@/pages/SellersPage';
import SellerProfilePage from '@/pages/SellerProfilePage';
import MySalesPage from '@/pages/MySalesPage';
import FlashSalePage from '@/pages/FlashSalePage';
import DepositPage from '@/pages/DepositPage';
import TransferPage from '@/pages/TransferPage';
import WithdrawPage from '@/pages/WithdrawPage';
import EscrowPage from '@/pages/EscrowPage';
import OrderHistoryPage from '@/pages/OrderHistoryPage';
import DeliveryCenterPage from '@/pages/DeliveryCenterPage';
import NewsPage from '@/pages/NewsPage';
import SupportPage from '@/pages/SupportPage';
import MessagesPage from '@/pages/MessagesPage';
import InboxPage from '@/pages/InboxPage';
import NotificationBell from '@/components/NotificationBell';

type PageProps = { onNavigate: (page: PageId) => void };

const PAGES: Record<PageId, ComponentType<PageProps>> = {
  balance: BalancePage,
  activity: ActivityPage,
  marketplace: MarketplacePage,
  sellers: SellersPage,
  'seller-profile': SellerProfilePage,
  'my-sales': MySalesPage,
  'flash-sale': FlashSalePage,
  deposit: DepositPage,
  transfer: TransferPage,
  withdraw: WithdrawPage,
  escrow: EscrowPage,
  'order-history': OrderHistoryPage,
  'delivery-center': DeliveryCenterPage,
  news: NewsPage,
  support: SupportPage,
  messages: MessagesPage,
  inbox: InboxPage,
};

function SidebarContent({
  activePage,
  onNavigate,
  onSignOut,
}: {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  onSignOut: () => void;
}) {
  const { profile, isSupportAgent } = useAccount();
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.supportAgentOnly || isSupportAgent),
  }));
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-7 pt-6">
        <div className="group flex items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 via-cyan-300 to-sky-400 text-zinc-950 shadow-lg shadow-cyan-500/20 transition-transform duration-300 group-hover:scale-105">
            <div className="absolute inset-0 rounded-2xl bg-white/20 blur-sm" />
            <Store className="relative h-6 w-6" strokeWidth={2.5} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="bg-gradient-to-r from-emerald-300 via-cyan-200 to-sky-300 bg-clip-text text-[26px] font-black leading-none tracking-[-0.06em] text-transparent">elonstore</p>
              <img
                src="/images/Screenshot_2026-11-01_125712.png"
                alt="Escrow protected"
                className="h-6 w-6 shrink-0 rounded-full border border-cyan-300/50 object-cover object-center shadow-md shadow-cyan-500/20"
              />
            </div>
            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Secure · Escrow protected</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6" aria-label="Main navigation">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.id === activePage;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20'
                          : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100'
                      }`}
                    >
                      <Icon
                        className={`h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-emerald-300' : ''}`}
                        aria-hidden
                      />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-800 p-4">
        <div className="mb-3 rounded-xl bg-zinc-900 px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-zinc-100">{profile.display_name || profile.handle}</p>
          <p className="truncate text-xs text-zinc-500">@{profile.handle}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800/70 hover:text-rose-300"
        >
          <LogOut className="h-[18px] w-[18px]" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { balanceCents, profile, signOut } = useAccount();
  const [page, setPage] = useState<PageId>('balance');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = (next: PageId) => {
    setPage(next);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const ActivePage = PAGES[page];
  const activeLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === page)?.label ?? '';

  return (
    <div className="min-h-screen bg-zinc-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-800 bg-zinc-950 lg:block">
        <SidebarContent activePage={page} onNavigate={navigate} onSignOut={signOut} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-black/70 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-[slide-in_0.25s_ease-out] border-r border-zinc-800 bg-zinc-950 shadow-2xl">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <SidebarContent activePage={page} onNavigate={navigate} onSignOut={signOut} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-zinc-300 transition hover:bg-zinc-800 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-400">
              <span className="lg:hidden">Menu</span>
              <span className="hidden lg:inline">{activeLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => navigate('marketplace')}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-2.5 py-2 text-sm font-medium text-zinc-300 transition hover:border-emerald-400/40 hover:bg-zinc-800 hover:text-emerald-300 sm:px-3"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Cart</span>
            </button>
            <NotificationBell onNavigate={navigate} />
            <div className="hidden items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 sm:flex">
              <UserRound className="h-4 w-4 text-zinc-500" aria-hidden />
              <span className="max-w-24 truncate text-sm font-medium text-zinc-300">{profile.handle}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2">
              <span className="hidden text-[11px] font-medium uppercase tracking-wider text-cyan-100/70 sm:inline">Balance</span>
              <span className="text-sm font-bold tabular-nums text-cyan-200">{formatMoney(balanceCents)}</span>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-2.5 py-2 text-zinc-400 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300 sm:px-3"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden text-sm sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-8 sm:py-10">
          <div key={page} className="animate-[fade-in_0.3s_ease-out]">
            <ActivePage onNavigate={navigate} />
          </div>
        </main>
      </div>
    </div>
  );
}

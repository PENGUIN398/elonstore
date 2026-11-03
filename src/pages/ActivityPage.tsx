import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Activity, Package, ShieldCheck, ShoppingBag } from 'lucide-react';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui';
import TransactionList from '@/components/TransactionList';
import { useAccount } from '@/context/auth';
import { formatMoney } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { PageId } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Order, Transaction } from '@/lib/types';

type Filter = 'all' | 'in' | 'out';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'in', label: 'Money in' }, { id: 'out', label: 'Money out' }];

type Props = { onNavigate: (page: PageId) => void };

export default function ActivityPage({ onNavigate }: Props) {
  const { profile } = useAccount();
  const [filter, setFilter] = useState<Filter>('all');
  const { data, error, loading, reload } = useLoad(async () => {
    const [transactions, orders] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('orders').select('*').eq('buyer_id', profile.id).in('status', ['escrow', 'delivered']).order('created_at', { ascending: false }).limit(100),
    ]);
    return { transactions: unwrap<Transaction[]>(transactions), orders: unwrap<Order[]>(orders) };
  }, [profile.id]);

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === 'in') return data.transactions.filter((transaction) => transaction.amount_cents > 0);
    if (filter === 'out') return data.transactions.filter((transaction) => transaction.amount_cents < 0);
    return data.transactions;
  }, [data, filter]);

  const deposits = data?.transactions.filter((transaction) => transaction.kind === 'deposit') ?? [];
  const purchases = data?.transactions.filter((transaction) => transaction.kind === 'purchase') ?? [];
  const escrowTotal = data?.orders.reduce((sum, order) => sum + order.amount_cents, 0) ?? 0;
  const purchaseTotal = purchases.reduce((sum, transaction) => sum + Math.abs(transaction.amount_cents), 0);

  return (
    <div>
      <PageHeader eyebrow="Ledger" title="My Activity" description="A clear view of your deposits, escrow deals, purchases and account movements." />

      {loading && <Spinner label="Loading activity" />}
      {error && <div className="mb-6 space-y-3"><Notice tone="error">{error}</Notice><Button variant="secondary" onClick={reload}>Try again</Button></div>}

      {!loading && data && <>
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Card className="border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.12] to-zinc-900/80"><div className="flex items-start justify-between"><div><p className="text-sm text-cyan-100/70">Pending deposits</p><p className="mt-2 text-3xl font-bold tabular-nums text-cyan-200">{deposits.length}</p><p className="mt-1 text-xs text-cyan-100/50">{formatMoney(deposits.reduce((sum, transaction) => sum + transaction.amount_cents, 0))} total</p></div><div className="rounded-xl bg-cyan-400/15 p-2.5 text-cyan-300"><ArrowDownToLine className="h-5 w-5" aria-hidden /></div></div></Card>
          <Card className="border-amber-400/20 bg-gradient-to-br from-amber-400/[0.12] to-zinc-900/80"><div className="flex items-start justify-between"><div><p className="text-sm text-amber-100/70">Open escrow deals</p><p className="mt-2 text-3xl font-bold tabular-nums text-amber-200">{data.orders.length}</p><p className="mt-1 text-xs text-amber-100/50">{formatMoney(escrowTotal)} total</p></div><div className="rounded-xl bg-amber-400/15 p-2.5 text-amber-300"><ShieldCheck className="h-5 w-5" aria-hidden /></div></div></Card>
          <Card className="border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.12] to-zinc-900/80"><div className="flex items-start justify-between"><div><p className="text-sm text-emerald-100/70">Active purchases</p><p className="mt-2 text-3xl font-bold tabular-nums text-emerald-200">{purchases.length}</p><p className="mt-1 text-xs text-emerald-100/50">{formatMoney(purchaseTotal)} total</p></div><div className="rounded-xl bg-emerald-400/15 p-2.5 text-emerald-300"><ShoppingBag className="h-5 w-5" aria-hidden /></div></div></Card>
        </div>

        <div className="mb-8 grid gap-5 lg:grid-cols-3">
          <ActivityPanel icon={ArrowDownToLine} title="Deposits" description="Crypto top-ups and their verification status" tone="cyan" actionLabel="New deposit" onAction={() => onNavigate('deposit')} emptyText="No deposits yet." />
          <ActivityPanel icon={ShieldCheck} title="Escrow deals" description="Deals where you are the buyer and funds are held" tone="amber" actionLabel="Open escrow" onAction={() => onNavigate('escrow')} emptyText={data.orders.length ? `${data.orders.length} open deal${data.orders.length === 1 ? '' : 's'}` : 'You have no escrow deals yet.'} />
          <ActivityPanel icon={Package} title="Service purchases" description="Products and services bought from sellers" tone="emerald" actionLabel="Browse market" onAction={() => onNavigate('marketplace')} emptyText={purchases.length ? `${purchases.length} purchase${purchases.length === 1 ? '' : 's'} recorded` : 'No purchases yet.'} />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold text-zinc-100">All movements</h2><p className="mt-1 text-sm text-zinc-500">Every deposit, transfer, purchase, refund and sale.</p></div><div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1" role="tablist">{FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${filter === item.id ? 'bg-zinc-800 text-emerald-300 shadow-sm' : 'text-zinc-400 hover:text-zinc-100'}`}>{item.label}</button>)}</div></div>
        {visible.length === 0 ? <EmptyState icon={Activity} title="Nothing here yet" text="Movements matching this filter will appear here." /> : <TransactionList transactions={visible} />}
      </>}
    </div>
  );
}

function ActivityPanel({ icon: Icon, title, description, tone, actionLabel, onAction, emptyText }: { icon: typeof ArrowDownToLine; title: string; description: string; tone: 'cyan' | 'amber' | 'emerald'; actionLabel: string; onAction: () => void; emptyText: string }) {
  const styles = { cyan: 'border-cyan-400/20 text-cyan-300', amber: 'border-amber-400/20 text-amber-300', emerald: 'border-emerald-400/20 text-emerald-300' }[tone];
  return <Card className={`flex h-full flex-col gap-5 ${styles}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-current/10 p-2"><Icon className="h-5 w-5" aria-hidden /></div><div><h2 className="font-semibold text-zinc-100">{title}</h2><p className="mt-0.5 text-xs text-zinc-500">{description}</p></div></div><Button variant="secondary" className="shrink-0 px-3 py-2 text-xs" onClick={onAction}>{actionLabel}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button></div><div className="flex min-h-20 flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/30 px-4 text-center text-sm text-zinc-500">{emptyText}</div></Card>;
}

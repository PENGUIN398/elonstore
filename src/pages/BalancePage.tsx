import { ArrowDownToLine, ArrowLeftRight, ArrowRight, Banknote, ShieldCheck, Wallet, type LucideIcon } from 'lucide-react';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui';
import TransactionList from '@/components/TransactionList';
import { useAccount } from '@/context/auth';
import { formatMoney } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { PageId } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Order, Transaction } from '@/lib/types';

type Props = { onNavigate: (page: PageId) => void };

export default function BalancePage({ onNavigate }: Props) {
  const { profile, balanceCents } = useAccount();

  const { data, error, loading, reload } = useLoad(async () => {
    const [transactions, escrowOrders, walletRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5),
      supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', profile.id)
        .in('status', ['escrow', 'delivered']),
      supabase.from('wallets').select('escrow_balance_cents').eq('user_id', profile.id).maybeSingle(),
    ]);
    return {
      transactions: unwrap<Transaction[]>(transactions),
      escrow: unwrap<Order[]>(escrowOrders),
      escrowBalance: ((walletRes.data?.escrow_balance_cents as number | undefined) ?? 0),
    };
  }, [profile.id]);

  const ordersEscrowTotal = data?.escrow.reduce((sum, o) => sum + o.amount_cents, 0) ?? 0;
  const escrowTotal = ordersEscrowTotal + (data?.escrowBalance ?? 0);

  const quickActions: { page: PageId; label: string; icon: LucideIcon }[] = [
    { page: 'deposit', label: 'Deposit', icon: ArrowDownToLine },
    { page: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
    { page: 'escrow', label: 'Escrow', icon: ShieldCheck },
    { page: 'withdraw', label: 'Withdraw', icon: Banknote },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`Hello, ${profile.display_name || profile.handle}`}
        description="Your available funds, money held in escrow and your most recent movements."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="relative overflow-hidden lg:col-span-3">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-2xl" />
          <div className="relative space-y-8">
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-400">Available balance</p>
              <p className="text-5xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-6xl">
                {formatMoney(balanceCents)}
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-zinc-500">In escrow</p>
                <p className="mt-0.5 font-semibold tabular-nums text-amber-300">{formatMoney(escrowTotal)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Account</p>
                <p className="mt-0.5 font-semibold text-zinc-200">@{profile.handle}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {quickActions.map(({ page, label, icon: Icon }) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => onNavigate(page)}
                  className="group flex flex-col items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-4 text-sm font-medium text-zinc-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/40 hover:text-emerald-300"
                >
                  <Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100">Recent activity</h2>
            <button
              type="button"
              onClick={() => onNavigate('activity')}
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {loading && <Spinner label="Loading activity" />}
          {error && (
            <div className="space-y-3">
              <Notice tone="error">{error}</Notice>
              <Button variant="secondary" onClick={reload}>Try again</Button>
            </div>
          )}
          {data && data.transactions.length === 0 && (
            <EmptyState icon={Wallet} title="No activity yet" text="Deposit funds to get started." />
          )}
          {data && data.transactions.length > 0 && <TransactionList transactions={data.transactions} />}
        </Card>
      </div>
    </div>
  );
}

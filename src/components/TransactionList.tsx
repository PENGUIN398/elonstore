import { ArrowDownLeft, ArrowUpRight, BadgeCheck, Banknote, Landmark, Package, RotateCcw, ShieldCheck, ShoppingBag, Wallet, type LucideIcon } from 'lucide-react';
import { formatDateTime, formatSignedMoney } from '@/lib/format';
import type { Transaction, TransactionKind } from '@/lib/types';

const KIND_META: Record<TransactionKind, { label: string; icon: LucideIcon }> = {
  deposit: { label: 'Deposit', icon: ArrowDownLeft },
  withdrawal: { label: 'Withdrawal', icon: Banknote },
  transfer_in: { label: 'Received', icon: ArrowDownLeft },
  transfer_out: { label: 'Sent', icon: ArrowUpRight },
  purchase: { label: 'Purchase', icon: ShoppingBag },
  refund: { label: 'Refund', icon: RotateCcw },
  sale: { label: 'Sale', icon: Package },
  escrow_fund: { label: 'To escrow', icon: ShieldCheck },
  escrow_from_binance: { label: 'Binance to escrow', icon: Landmark },
  seller_fee: { label: 'Seller activation', icon: BadgeCheck },
};

export default function TransactionList({ transactions }: { transactions: Transaction[] }) {
  return (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
      {transactions.map((tx) => {
        const meta = KIND_META[tx.kind] ?? { label: tx.kind, icon: Wallet };
        const Icon = meta.icon;
        const positive = tx.amount_cents > 0;
        return (
          <li key={tx.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-800/40">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                positive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">{tx.description || meta.label}</p>
              <p className="text-xs text-zinc-500">{formatDateTime(tx.created_at)}</p>
            </div>
            <p
              className={`shrink-0 text-sm font-semibold tabular-nums ${positive ? 'text-emerald-300' : 'text-zinc-200'}`}
            >
              {formatSignedMoney(tx.amount_cents)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

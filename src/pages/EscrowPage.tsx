import { useState, type FormEvent } from 'react';
import { Landmark, Plus, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import { Button, Card, EmptyState, Field, Modal, Notice, PageHeader, Spinner, inputClass } from '@/components/ui';
import OrderCard from '@/components/OrderCard';
import { useAccount } from '@/context/auth';
import { formatMoney, parseDollarsToCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/types';
import Trc20AddressCard from '@/components/Trc20AddressCard';

type Source = 'wallet' | 'binance';

export default function EscrowPage() {
  const { profile, balanceCents, refreshAccount } = useAccount();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, error: loadError, loading, reload } = useLoad(
    async () => {
      const walletRes = await supabase
        .from('wallets')
        .select('escrow_balance_cents')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (walletRes.error) throw new Error(walletRes.error.message);
      const ordersRes = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', profile.id)
        .in('status', ['escrow', 'delivered'])
        .order('created_at', { ascending: false });
      if (ordersRes.error) throw new Error(ordersRes.error.message);
      return {
        escrowBalance: (walletRes.data?.escrow_balance_cents as number | undefined) ?? 0,
        orders: (ordersRes.data ?? []) as Order[],
      };
    },
    [profile.id]
  );

  const escrowBalance = data?.escrowBalance ?? 0;
  const ordersTotal = data?.orders.reduce((sum, o) => sum + o.amount_cents, 0) ?? 0;

  const [fundOpen, setFundOpen] = useState(false);
  const [source, setSource] = useState<Source>('wallet');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundDone, setFundDone] = useState<string | null>(null);

  const openFund = (s: Source) => {
    setSource(s);
    setAmount('');
    setReference('');
    setFundError(null);
    setFundDone(null);
    setFundOpen(true);
  };

  const handleFund = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFundError(null);
    setFundDone(null);
    const cents = parseDollarsToCents(amount);
    if (cents === null) {
      setFundError('Enter an amount greater than $0.00, for example 50.00.');
      return;
    }
    if (source === 'binance' && reference.trim().length < 10) {
      setFundError('Enter the transaction ID from your Binance transfer.');
      return;
    }
    if (source === 'wallet' && cents > balanceCents) {
      setFundError('You do not have enough balance to fund escrow. Deposit funds first.');
      return;
    }
    setSaving(true);
    if (source === 'wallet') {
      const { error: rpcError } = await supabase.rpc('fund_escrow_from_wallet', { p_amount_cents: cents });
      if (rpcError) {
        setFundError(getErrorMessage(rpcError));
      } else {
        await refreshAccount();
        reload();
        setFundDone(`${formatMoney(cents)} moved from your wallet into escrow.`);
        setAmount('');
      }
    } else {
      const { error: rpcError } = await supabase.rpc('submit_binance_payment', {
        p_amount_cents: cents,
        p_txid: reference.trim(),
        p_destination: 'escrow',
      });
      if (rpcError) {
        setFundError(getErrorMessage(rpcError));
      } else {
        setFundDone(`${formatMoney(cents)} has been added to your escrow balance.`);
        setAmount('');
        setReference('');
      }
    }
    setSaving(false);
  };

  const act = async (orderId: string, fn: 'release_order' | 'refund_order') => {
    setBusyId(orderId);
    setError(null);
    const { error: rpcError } = await supabase.rpc(fn, { p_order_id: orderId });
    if (rpcError) {
      setError(getErrorMessage(rpcError));
    } else {
      await refreshAccount();
      reload();
    }
    setBusyId(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Protection"
        title="Escrow"
        description="Park money safely in escrow, then release it when a seller delivers. Fund escrow from your wallet or straight from Binance."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openFund('wallet')}>
              <Wallet className="h-4 w-4" aria-hidden />
              Add from wallet
            </Button>
            <Button onClick={() => openFund('binance')}>
              <Landmark className="h-4 w-4" aria-hidden />
              Add from Binance
            </Button>
          </div>
        }
      />

      <div className="mb-6">
        <Trc20AddressCard />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="relative space-y-2">
            <div className="flex items-center gap-2 text-amber-300">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <p className="text-xs font-medium uppercase tracking-wider">Escrow balance</p>
            </div>
            <p className="text-4xl font-bold tabular-nums tracking-tight text-zinc-50">{formatMoney(escrowBalance)}</p>
            <p className="text-xs text-zinc-500">Money you have parked in escrow protection.</p>
            <div className="pt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openFund('wallet')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> From wallet
              </button>
              <button
                type="button"
                onClick={() => openFund('binance')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> From Binance
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Wallet balance</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight text-emerald-300">{formatMoney(balanceCents)}</p>
            <p className="text-xs text-zinc-500">Funds available to spend or move into escrow.</p>
          </div>
        </Card>

        <Card>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Held in orders</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight text-zinc-100">{formatMoney(ordersTotal)}</p>
            <p className="text-xs text-zinc-500">Already tied up in active purchases.</p>
          </div>
        </Card>
      </div>

      {error && <div className="mt-6"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-8 space-y-4">
        <h2 className="text-base font-semibold text-zinc-100">Active orders</h2>
        {loading && <Spinner label="Loading escrow" />}
        {loadError && (
          <div className="space-y-3">
            <Notice tone="error">{loadError}</Notice>
            <Button variant="secondary" onClick={reload}>Try again</Button>
          </div>
        )}
        {data && data.orders.length === 0 && (
          <EmptyState icon={ShieldCheck} title="No funds in escrow" text="Orders awaiting delivery or confirmation show up here." />
        )}
        {data && data.orders.length > 0 && (
          <div className="space-y-4">
            {data.orders.map((order) => (
              <OrderCard key={order.id} order={order} role="buyer">
                {order.status === 'delivered' && (
                  <Button loading={busyId === order.id} onClick={() => act(order.id, 'release_order')}>
                    Confirm receipt
                  </Button>
                )}
                {order.status === 'escrow' && (
                  <Button variant="secondary" loading={busyId === order.id} onClick={() => act(order.id, 'refund_order')}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Request refund
                  </Button>
                )}
              </OrderCard>
            ))}
          </div>
        )}
      </div>

      <Modal open={fundOpen} title="Add money to escrow" onClose={() => setFundOpen(false)}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-1.5">
            <button
              type="button"
              onClick={() => setSource('wallet')}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                source === 'wallet'
                  ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Wallet className="h-4 w-4" aria-hidden /> From wallet
            </button>
            <button
              type="button"
              onClick={() => setSource('binance')}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                source === 'binance'
                  ? 'bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Landmark className="h-4 w-4" aria-hidden /> From Binance
            </button>
          </div>

          {source === 'binance' && (
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">Submit TXID</h3>
              <p className="mt-1 text-sm text-zinc-500">Submit your completed Binance TRC20 payment for verification.</p>
            </div>
          )}
          {source === 'binance' && <Trc20AddressCard />}

          <form onSubmit={handleFund} className="space-y-5" noValidate>
            <Field
              label="Amount (USD)"
              hint={source === 'wallet' ? `Available: ${formatMoney(balanceCents)}` : 'Amount to deposit from Binance into escrow.'}
            >
              <input
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50.00"
              />
            </Field>

            {source === 'binance' && (
              <Field label="Transaction ID (TXID)" hint="Required. Paste the transaction ID from your completed Binance TRC20 transfer.">
                <input
                  className={inputClass}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Paste your TRON transaction ID"
                  autoComplete="off"
                />
              </Field>
            )}

            {fundError && <Notice tone="error">{fundError}</Notice>}
            {fundDone && <Notice tone="success">{fundDone}</Notice>}

            <Button type="submit" loading={saving} className="w-full">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              {source === 'wallet' ? 'Move to escrow' : 'Submit payment for review'}
            </Button>
          </form>

          <p className="text-xs leading-relaxed text-zinc-500">
            {source === 'wallet'
              ? 'Money moves from your spendable wallet into your protected escrow balance.'
              : 'Your payment stays pending until the TRON transaction is verified. No escrow funds are added from the form alone.'}
          </p>
        </div>
      </Modal>
    </div>
  );
}

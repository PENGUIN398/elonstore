import { useState, type FormEvent } from 'react';
import { ArrowDownToLine, CheckCircle2 } from 'lucide-react';
import { Button, Card, Field, Notice, PageHeader, inputClass } from '@/components/ui';
import { useAccount } from '@/context/auth';
import { formatMoney, parseDollarsToCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import Trc20AddressCard from '@/components/Trc20AddressCard';

export default function DepositPage() {
  const { balanceCents, refreshAccount } = useAccount();
  const [amount, setAmount] = useState('');
  const [txid, setTxid] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    const cents = parseDollarsToCents(amount);
    if (cents === null) {
      setError('Enter an amount greater than $0.00, for example 50.00.');
      return;
    }
    if (txid.trim().length < 10) {
      setError('Enter the transaction ID from your Binance transfer.');
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('submit_binance_payment', {
      p_amount_cents: cents,
      p_txid: txid.trim(),
      p_destination: 'wallet',
    });
    if (rpcError) {
      setError(getErrorMessage(rpcError));
    } else {
      await refreshAccount();
      setDone(`${formatMoney(cents)} has been added to your wallet.`);
      setAmount('');
      setTxid('');
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader eyebrow="Wallet" title="Deposit" description="Submit your Binance TRC20 transaction ID and amount. The listed amount is added to your wallet immediately." />
      <div className="mb-6">
        <Trc20AddressCard />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Submit TXID</h2>
              <p className="mt-1 text-sm text-zinc-500">Submit your TXID for verification. Your balance will be added shortly.</p>
            </div>
            <Field label="Amount (USDT)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50.00"
              />
            </Field>
            <Field label="Transaction ID (TXID)" hint="Required. Paste the transaction ID from your completed Binance TRC20 transfer.">
              <input
                className={inputClass}
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                placeholder="Paste your TRON transaction ID"
                autoComplete="off"
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            {done && (
              <Notice tone="success">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" aria-hidden />{done}</span>
              </Notice>
            )}
            <Button type="submit" loading={saving} className="w-full">
              <ArrowDownToLine className="h-4 w-4" aria-hidden />
              Submit TXID
            </Button>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <p className="text-sm text-zinc-400">Current balance</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-50">{formatMoney(balanceCents)}</p>
          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            Your funds are escrow-protected and easy to withdraw anytime.
          </p>
        </Card>
      </div>
    </div>
  );
}

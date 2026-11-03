import { useState, type FormEvent } from 'react';
import { Banknote, CheckCircle2 } from 'lucide-react';
import { Button, Card, Field, Notice, PageHeader, inputClass } from '@/components/ui';
import { useAccount } from '@/context/auth';
import { formatMoney, parseDollarsToCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function WithdrawPage() {
  const { balanceCents, refreshAccount } = useAccount();
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    const cents = parseDollarsToCents(amount);
    if (cents === null) {
      setError('Enter an amount greater than $0.00.');
      return;
    }
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress.trim())) {
      setError('Enter a valid TRON TRC20 wallet address.');
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('withdraw_funds', {
      p_amount_cents: cents,
      p_wallet_address: walletAddress.trim(),
    });
    if (rpcError) {
      setError(getErrorMessage(rpcError));
    } else {
      await refreshAccount();
      setDone(`${formatMoney(cents)} withdrawal submitted to your wallet.`);
      setAmount('');
      setWalletAddress('');
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader eyebrow="Wallet" title="Withdraw" description="Move funds out of your elonstore balance anytime. Easy withdrawal, escrow-protected money." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <Field label="Amount (USD)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="20.00"
              />
            </Field>
            <Field label="Destination wallet (TRC20)" hint="Use a TRON/TRC20 wallet address. Check it carefully because blockchain transfers cannot be reversed.">
              <input
                className={inputClass}
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="T..."
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            {done && (
              <Notice tone="success">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" aria-hidden />{done}</span>
              </Notice>
            )}
            <Button type="submit" loading={saving} className="w-full">
              <Banknote className="h-4 w-4" aria-hidden />
              Withdraw
            </Button>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <p className="text-sm text-zinc-400">Available to withdraw</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-50">{formatMoney(balanceCents)}</p>
        </Card>
      </div>
    </div>
  );
}

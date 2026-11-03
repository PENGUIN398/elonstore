import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { Button, Card, Field, Notice, PageHeader, inputClass } from '@/components/ui';
import { useAccount } from '@/context/auth';
import { formatMoney, parseDollarsToCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function TransferPage() {
  const { balanceCents, refreshAccount } = useAccount();
  const [handle, setHandle] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    const recipient = handle.trim().replace(/^@/, '');
    if (!recipient) {
      setError('Enter the recipient handle.');
      return;
    }
    const cents = parseDollarsToCents(amount);
    if (cents === null) {
      setError('Enter an amount greater than $0.00.');
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('transfer_funds', {
      p_recipient_handle: recipient,
      p_amount_cents: cents,
    });
    if (rpcError) {
      setError(getErrorMessage(rpcError));
    } else {
      await refreshAccount();
      setDone(`${formatMoney(cents)} sent to @${recipient.toLowerCase()}.`);
      setAmount('');
      setHandle('');
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader eyebrow="Wallet" title="Transfer" description="Send funds instantly to another elonstore member by handle." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <Field label="Recipient handle" hint="Find a handle on the Sellers page or ask the recipient.">
              <input
                className={inputClass}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@handle"
              />
            </Field>
            <Field label="Amount (USD)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10.00"
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            {done && (
              <Notice tone="success">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" aria-hidden />{done}</span>
              </Notice>
            )}
            <Button type="submit" loading={saving} className="w-full">
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
              Send funds
            </Button>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <p className="text-sm text-zinc-400">Available to send</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-50">{formatMoney(balanceCents)}</p>
        </Card>
      </div>
    </div>
  );
}

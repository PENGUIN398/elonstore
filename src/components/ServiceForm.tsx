import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button, Notice, inputClass } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { parseDollarsToCents } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type PricingModel = 'fixed' | 'hourly';

export default function ServiceForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [autoDelivery, setAutoDelivery] = useState('');
  const [rate, setRate] = useState('');
  const [pricing, setPricing] = useState<PricingModel>('fixed');
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setAutoDelivery('');
    setRate('');
    setPricing('fixed');
    setDays('');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Give your service a title.');
      return;
    }
    const cents = parseDollarsToCents(rate);
    if (cents === null) {
      setError('Enter a rate greater than $0.00, for example 25.00.');
      return;
    }
    let deliveryDays: number | null = null;
    if (days.trim()) {
      const parsed = Number(days.trim());
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
        setError('Delivery days must be a whole number between 0 and 365.');
        return;
      }
      deliveryDays = parsed;
    }

    setSaving(true);
    const { error: rpcError } = await supabase.rpc('create_service', {
      p_title: title.trim(),
      p_description: description.trim(),
      p_pricing_model: pricing,
      p_price_cents: cents,
      p_delivery_days: deliveryDays,
      p_auto_delivery: autoDelivery.trim(),
    });
    setSaving(false);

    if (rpcError) {
      setError(getErrorMessage(rpcError, 'We could not add this service.'));
      return;
    }
    reset();
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5" noValidate>
      <p className="text-sm font-medium text-zinc-300">Add a service</p>

      <input
        className={inputClass}
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Service title"
        aria-label="Service title"
      />
      <textarea
        className={`${inputClass} min-h-[96px] resize-y`}
        maxLength={2000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What the buyer gets"
        aria-label="What the buyer gets"
      />
      <textarea
        className={`${inputClass} min-h-[96px] resize-y`}
        maxLength={5000}
        value={autoDelivery}
        onChange={(e) => setAutoDelivery(e.target.value)}
        placeholder="Automatic delivery text or URL (optional)"
        aria-label="Automatic delivery text or URL"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          className={inputClass}
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="Rate USD"
          aria-label="Rate in USD"
        />
        <select
          className={inputClass}
          value={pricing}
          onChange={(e) => setPricing(e.target.value as PricingModel)}
          aria-label="Pricing model"
        >
          <option value="fixed">fixed</option>
          <option value="hourly">hourly</option>
        </select>
        <input
          className={inputClass}
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="Days"
          aria-label="Delivery days"
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Button type="submit" variant="secondary" loading={saving} className="w-full">
        <Plus className="h-4 w-4" aria-hidden />
        Add service
      </Button>
    </form>
  );
}

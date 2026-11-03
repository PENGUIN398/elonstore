import { useState, type FormEvent } from 'react';
import { Button, Field, Modal, Notice, inputClass } from '@/components/ui';
import { useAccount } from '@/context/auth';
import { getErrorMessage } from '@/lib/errors';
import { parseDollarsToCents } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Listing } from '@/lib/types';

type Props = {
  open: boolean;
  listing: Listing | null;
  onClose: () => void;
  onSaved: () => void;
  startAsFlash?: boolean;
};

type FormState = {
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  price: string;
  stock: string;
  onFlash: boolean;
  flashPrice: string;
  flashEndsAt: string;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function initialState(listing: Listing | null, startAsFlash: boolean): FormState {
  return {
    title: listing?.title ?? '',
    description: listing?.description ?? '',
    category: listing?.category ?? '',
    imageUrl: listing?.image_url ?? '',
    price: listing ? (listing.price_cents / 100).toFixed(2) : '',
    stock: listing ? String(listing.stock) : '1',
    onFlash: listing ? !!listing.flash_price_cents : startAsFlash,
    flashPrice: listing?.flash_price_cents ? (listing.flash_price_cents / 100).toFixed(2) : '',
    flashEndsAt: toLocalInput(listing?.flash_ends_at ?? null),
  };
}

function validate(form: FormState): { error: string } | { payload: Record<string, unknown> } {
  const title = form.title.trim();
  if (!title) return { error: 'Give your listing a title.' };
  const price = parseDollarsToCents(form.price);
  if (price === null) return { error: 'Enter a valid price, for example 9.99.' };
  const stock = Number.parseInt(form.stock, 10);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
    return { error: 'Stock must be a whole number between 0 and 100,000.' };
  }

  let flash_price_cents: number | null = null;
  let flash_ends_at: string | null = null;
  if (form.onFlash) {
    flash_price_cents = parseDollarsToCents(form.flashPrice);
    if (flash_price_cents === null) return { error: 'Enter a valid flash sale price.' };
    if (flash_price_cents >= price) return { error: 'The flash sale price must be lower than the regular price.' };
    if (!form.flashEndsAt) return { error: 'Choose when the flash sale ends.' };
    const ends = new Date(form.flashEndsAt);
    if (Number.isNaN(ends.getTime()) || ends.getTime() <= Date.now()) {
      return { error: 'The flash sale end time must be in the future.' };
    }
    flash_ends_at = ends.toISOString();
  }

  const imageUrl = form.imageUrl.trim();
  if (imageUrl && !/^https:\/\//.test(imageUrl)) {
    return { error: 'The image link must start with https://' };
  }

  return {
    payload: {
      title,
      description: form.description.trim(),
      category: form.category.trim() || 'General',
      image_url: imageUrl || null,
      price_cents: price,
      stock,
      flash_price_cents,
      flash_ends_at,
    },
  };
}

const labelClass = 'text-sm font-medium text-zinc-300';

export default function ListingFormModal({ open, listing, onClose, onSaved, startAsFlash = false }: Props) {
  const { profile } = useAccount();
  const [form, setForm] = useState<FormState>(() => initialState(listing, startAsFlash));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = listing !== null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const result = validate(form);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setSaving(true);
    const query = isEdit
      ? supabase.from('listings').update(result.payload).eq('id', listing.id)
      : supabase.from('listings').insert({ ...result.payload, seller_id: profile.id });
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(getErrorMessage(saveError, 'We could not save this listing.'));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal open={open} title={isEdit ? 'Edit listing' : startAsFlash ? 'Quick flash sale' : 'New listing'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Field label="Title">
          <input
            className={inputClass}
            maxLength={120}
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="E.g. Weekly planner templates"
          />
        </Field>
        <Field label="Description">
          <textarea
            className={`${inputClass} min-h-[96px] resize-y`}
            maxLength={2000}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="What does the buyer receive?"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Price (USD)">
            <input
              className={inputClass}
              inputMode="decimal"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              placeholder="9.99"
            />
          </Field>
          <Field label="Stock">
            <input
              className={inputClass}
              inputMode="numeric"
              value={form.stock}
              onChange={(e) => update('stock', e.target.value)}
            />
          </Field>
          <Field label="Category">
            <input
              className={inputClass}
              maxLength={40}
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              placeholder="Design"
            />
          </Field>
        </div>
        <Field label="Image link (optional)" hint="Paste a public https:// image address.">
          <input
            className={inputClass}
            value={form.imageUrl}
            onChange={(e) => update('imageUrl', e.target.value)}
            placeholder="https://"
          />
        </Field>

        <div className="space-y-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="space-y-0.5">
              <span className={`${labelClass} block`}>Run as a flash sale</span>
              <span className="block text-xs text-zinc-500">Show a discounted price until a set time.</span>
            </span>
            <input
              type="checkbox"
              checked={form.onFlash}
              onChange={(e) => update('onFlash', e.target.checked)}
              className="h-5 w-5 accent-amber-400"
            />
          </label>
          {form.onFlash && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Flash price (USD)">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={form.flashPrice}
                  onChange={(e) => update('flashPrice', e.target.value)}
                  placeholder="6.99"
                />
              </Field>
              <Field label="Ends at" hint="Choose the date and time from the calendar.">
                <input
                  type="datetime-local"
                  min={toLocalInput(new Date().toISOString())}
                  className={inputClass}
                  value={form.flashEndsAt}
                  onChange={(e) => update('flashEndsAt', e.target.value)}
                  aria-label="Flash sale end date and time"
                />
              </Field>
            </div>
          )}
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : startAsFlash ? 'Publish flash sale' : 'Publish listing'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

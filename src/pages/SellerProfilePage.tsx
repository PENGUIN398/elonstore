import { useState, type ChangeEvent, type FormEvent } from 'react';
import { BadgeCheck, ImagePlus, Lock, Save, Zap } from 'lucide-react';
import { Badge, Button, Card, Field, Modal, Notice, PageHeader, inputClass } from '@/components/ui';
import ServicesSection from '@/components/ServicesSection';
import ListingFormModal from '@/components/ListingFormModal';
import { useAccount } from '@/context/auth';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { PROFILE_SELECT, type Profile } from '@/lib/types';

const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

export default function SellerProfilePage() {
  const { profile, setProfile, balanceCents, refreshAccount } = useAccount();
  const [handle, setHandle] = useState(profile.handle);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [bio, setBio] = useState(profile.bio);
  const [isSeller] = useState(profile.is_seller);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flashSaleOpen, setFlashSaleOpen] = useState(false);
  const [sellerFeeOpen, setSellerFeeOpen] = useState(false);
  const [sellerFeeSaving, setSellerFeeSaving] = useState(false);
  const [sellerFeeError, setSellerFeeError] = useState<string | null>(null);

  const dirty =
    handle !== profile.handle ||
    displayName !== profile.display_name ||
    bio !== profile.bio;

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Profile photos must be 2 MB or smaller.');
      return;
    }

    setError(null);
    setSaved(false);
    setUploading(true);
    const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('seller-avatars').upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) {
      setError('We could not upload that photo. Please try again.');
      setUploading(false);
      return;
    }

    const { data: publicData } = supabase.storage.from('seller-avatars').getPublicUrl(path);
    const { data, error: saveError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicData.publicUrl })
      .eq('id', profile.id)
      .select(PROFILE_SELECT)
      .maybeSingle();
    setUploading(false);

    if (saveError || !data) {
      setError('The photo uploaded but could not be saved to your profile. Please try again.');
      return;
    }
    const nextProfile = data as Profile;
    setProfile(nextProfile);
    setAvatarUrl(nextProfile.avatar_url);
    setSaved(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const cleanHandle = handle.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(cleanHandle)) {
      setError('Your handle must be 3 to 24 characters using letters, numbers or underscores.');
      return;
    }
    if (displayName.trim().length > 60) {
      setError('Display names can be up to 60 characters.');
      return;
    }
    if (bio.trim().length > 500) {
      setError('Your bio can be up to 500 characters.');
      return;
    }

    setSaving(true);
    const { data, error: saveError } = await supabase
      .from('profiles')
      .update({
        handle: cleanHandle,
        display_name: displayName.trim(),
        bio: bio.trim(),
      })
      .eq('id', profile.id)
      .select(PROFILE_SELECT)
      .maybeSingle();
    setSaving(false);

    if (saveError) {
      const message = getErrorMessage(saveError, '');
      setError(
        message.includes('duplicate key')
          ? 'That handle is already taken. Choose another one.'
          : 'We could not save your profile. Please try again.'
      );
      return;
    }
    if (!data) {
      setError('We could not save your profile. Please try again.');
      return;
    }
    setProfile(data as Profile);
    setHandle(cleanHandle);
    setSaved(true);
  };

  const handleBecomeSeller = async () => {
    setSellerFeeError(null);
    setSellerFeeSaving(true);
    const { error: rpcError } = await supabase.rpc('become_seller');
    if (rpcError) {
      setSellerFeeError(getErrorMessage(rpcError, 'We could not process the seller activation. Please try again.'));
    } else {
      await refreshAccount();
      setSellerFeeOpen(false);
    }
    setSellerFeeSaving(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Seller"
        title="My Seller Profile"
        description="This is how buyers see you across the marketplace and on the Sellers page."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-5 lg:col-span-1">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Your seller profile" className="h-16 w-16 rounded-2xl border border-zinc-700 object-cover" />
            ) : (
              <img
                src="/images/Screenshot_2026-11-01_104631.png"
                alt="Seller profile placeholder"
                className="h-16 w-16 rounded-2xl border border-emerald-400/30 object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-zinc-100">{displayName || profile.handle}</p>
              <p className="truncate text-sm text-zinc-500">@{profile.handle}</p>
              <label
                htmlFor="seller-avatar-upload"
                className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-emerald-300 transition hover:text-emerald-200"
              >
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                {uploading ? 'Uploading...' : 'Change photo'}
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={profile.is_seller ? 'success' : 'neutral'}>
              {profile.is_seller ? 'Seller mode on' : 'Seller mode off'}
            </Badge>
            {profile.is_seller && (
              <Button variant="secondary" className="ml-auto px-3 py-2 text-xs" onClick={() => setFlashSaleOpen(true)}>
                <Zap className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                Quick flash sale
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Sales</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">{profile.sales_count}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Joined</p>
              <p className="mt-1 text-sm font-semibold text-zinc-200">Since {profile.seller_since_year}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Marketplace display name" hint="Buyers will see this name on your seller profile and listings.">
                <input
                  className={inputClass}
                  maxLength={60}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name or studio"
                />
              </Field>
              <Field label="Handle" hint="Buyers use this to send you transfers.">
                <input
                  className={inputClass}
                  maxLength={24}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="your_handle"
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Seller photo</p>
                  <p className="mt-1 text-xs text-zinc-500">JPG, PNG or WebP up to 2 MB. This appears beside your name across the marketplace.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/50 hover:text-emerald-300">
                  {uploading ? 'Uploading...' : 'Choose photo'}
                  <input id="seller-avatar-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={uploading} className="sr-only" />
                </label>
              </div>
            </div>

            <Field label="Bio">
              <textarea
                className={`${inputClass} min-h-[120px] resize-y`}
                maxLength={500}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell buyers what you create and how you deliver."
              />
            </Field>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <span className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 h-5 w-5 text-emerald-300" aria-hidden />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-zinc-100">Seller mode</span>
                  <span className="block text-xs text-zinc-500">
                    Appear on the Sellers page and manage your own listings.
                  </span>
                </span>
              </span>
              {isSeller ? (
                <span className="text-xs font-semibold text-emerald-300">Active</span>
              ) : (
                <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={() => { setSellerFeeError(null); setSellerFeeOpen(true); }}>
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  Pay $100 to unlock
                </Button>
              )}
            </label>

            {error && <Notice tone="error">{error}</Notice>}
            {saved && !dirty && <Notice tone="success">Your seller profile is up to date.</Notice>}

            <div className="flex justify-end">
              <Button type="submit" loading={saving} disabled={!dirty}>
                <Save className="h-4 w-4" aria-hidden />
                Save profile
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <ServicesSection />
      </div>

      {flashSaleOpen && (
        <ListingFormModal
          open={flashSaleOpen}
          listing={null}
          startAsFlash
          onClose={() => setFlashSaleOpen(false)}
          onSaved={() => undefined}
        />
      )}

      <Modal open={sellerFeeOpen} title="Become a seller" onClose={() => setSellerFeeOpen(false)}>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
              <BadgeCheck className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-100">One-time $100 payment</p>
              <p className="text-sm text-zinc-500">Unlock seller mode and start listing products and services.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Activation fee</span>
              <span className="font-semibold tabular-nums text-zinc-100">$100.00</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Wallet balance</span>
              <span className="font-semibold tabular-nums text-zinc-100">{formatMoney(balanceCents)}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-zinc-800 pt-2">
              <span className="text-zinc-400">Balance after</span>
              <span className="font-semibold tabular-nums text-zinc-100">{formatMoney(Math.max(balanceCents - 10000, 0))}</span>
            </div>
          </div>
          {balanceCents < 10000 && (
            <Notice tone="error">You need at least $100.00 in your wallet. Deposit funds first, then come back to unlock seller mode.</Notice>
          )}
          {sellerFeeError && <Notice tone="error">{sellerFeeError}</Notice>}
          <Button className="w-full" loading={sellerFeeSaving} disabled={balanceCents < 10000} onClick={() => void handleBecomeSeller()}>
            <Lock className="h-4 w-4" aria-hidden />
            Pay $100 and become a seller
          </Button>
        </div>
      </Modal>
    </div>
  );
}

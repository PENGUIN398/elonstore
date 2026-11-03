import { useState, type FormEvent } from 'react';
import { BadgeCheck, MessageCircle, PackageOpen, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal, Notice, PageHeader, Spinner, inputClass } from '@/components/ui';
import ListingCard from '@/components/ListingCard';
import ListingDetailModal from '@/components/ListingDetailModal';
import { useLoad } from '@/lib/hooks';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import { LISTING_SELECT } from '@/lib/listings';
import type { PageId } from '@/lib/navigation';
import type { Listing, Profile } from '@/lib/types';
import { PROFILE_SELECT } from '@/lib/types';

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function SellersPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { data, error, loading, reload } = useLoad(
    async () => unwrap<Profile[]>(await supabase.from('profiles').select(PROFILE_SELECT).eq('is_seller', true).order('sales_count', { ascending: false })),
    []
  );
  const [selectedSeller, setSelectedSeller] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<Listing[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [message, setMessage] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageDone, setMessageDone] = useState(false);

  const openSeller = async (seller: Profile) => {
    setSelectedSeller(seller);
    setCatalog([]);
    setCatalogError(null);
    setMessage('');
    setMessageDone(false);
    setCatalogLoading(true);
    const { data: listings, error: listingsError } = await supabase.from('listings').select(LISTING_SELECT).eq('seller_id', seller.id).eq('is_active', true).order('created_at', { ascending: false });
    if (listingsError) setCatalogError('We could not load this seller’s catalog.');
    else setCatalog((listings ?? []) as Listing[]);
    setCatalogLoading(false);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSeller || !message.trim()) return;
    setMessageSending(true);
    setCatalogError(null);
    const { error: sendError } = await supabase.rpc('start_seller_conversation', { p_seller_id: selectedSeller.id, p_body: message.trim() });
    if (sendError) setCatalogError(getErrorMessage(sendError, 'We could not send your message.'));
    else { setMessage(''); setMessageDone(true); }
    setMessageSending(false);
  };

  return (
    <div>
      <PageHeader eyebrow="Community" title="Sellers" description="Independent creators selling on elonstore. Open a profile to browse everything they offer." />
      {loading && <Spinner label="Loading sellers" />}
      {error && <div className="space-y-3"><Notice tone="error">{error}</Notice><Button variant="secondary" onClick={reload}>Try again</Button></div>}
      {data && data.length === 0 && <EmptyState icon={Users} title="No sellers yet" text="Turn on seller mode in My Seller Profile to be the first to list products." />}
      {data && data.length > 0 && <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{data.map((seller) => {
        const name = seller.display_name || seller.handle;
        return <button key={seller.id} type="button" onClick={() => void openSeller(seller)} className="text-left"><Card className="flex h-full flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/30">
          <div className="flex items-center gap-4">{seller.avatar_url ? <img src={seller.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl border border-zinc-700 object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-400 text-base font-bold text-zinc-950">{initialsOf(name) || '?'}</div>}<div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-base font-semibold text-zinc-100">{name}<BadgeCheck className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden /></p><p className="truncate text-sm text-zinc-500">@{seller.handle}</p></div></div>
          <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-zinc-400">{seller.bio || 'This seller has not added a bio yet.'}</p>
          <div className="mt-auto flex items-center justify-between border-t border-zinc-800 pt-4"><Badge tone="success">{seller.sales_count} sales</Badge><span className="text-xs text-zinc-500">Since {seller.seller_since_year}</span></div>
        </Card></button>;
      })}</div>}

      <Modal open={!!selectedSeller} title={selectedSeller ? `${selectedSeller.display_name || selectedSeller.handle}'s profile` : ''} onClose={() => setSelectedSeller(null)} wide>
        {selectedSeller && <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3">{selectedSeller.avatar_url ? <img src={selectedSeller.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400 text-lg font-bold text-zinc-950">{initialsOf(selectedSeller.display_name || selectedSeller.handle)}</div>}<div><p className="font-semibold text-zinc-100">{selectedSeller.display_name || selectedSeller.handle}</p><p className="text-sm text-zinc-500">@{selectedSeller.handle} · {selectedSeller.sales_count} sales</p></div></div><Button onClick={() => document.getElementById('seller-message-box')?.focus()}><MessageCircle className="h-4 w-4" aria-hidden /> Message seller</Button></div>
          <div><div className="mb-3 flex items-center gap-2"><PackageOpen className="h-4 w-4 text-emerald-300" aria-hidden /><h3 className="text-base font-semibold text-zinc-100">Everything from this seller</h3></div>{catalogLoading && <Spinner label="Loading catalog" />}{catalogError && <Notice tone="error">{catalogError}</Notice>}{!catalogLoading && !catalogError && catalog.length === 0 && <p className="rounded-xl border border-zinc-800 p-5 text-sm text-zinc-500">This seller has no active listings yet.</p>}{catalog.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{catalog.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={setSelectedListing} />)}</div>}</div>
          <form onSubmit={sendMessage} className="space-y-3 border-t border-zinc-800 pt-5"><div><h3 className="text-base font-semibold text-zinc-100">Message seller</h3><p className="mt-1 text-xs text-zinc-500">Ask a question before placing an order. Your signed-in email is shown in the conversation.</p></div><textarea id="seller-message-box" className={`${inputClass} min-h-24 resize-y`} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your message..." maxLength={4000} />{messageDone && <Notice tone="success">Message sent. Open Messages to continue the conversation.</Notice>}<div className="flex justify-end"><Button type="submit" loading={messageSending} disabled={!message.trim()}>Send message</Button></div></form>
        </div>}
      </Modal>
      <ListingDetailModal listing={selectedListing} onClose={() => setSelectedListing(null)} onPurchased={() => undefined} onNavigate={onNavigate} />
    </div>
  );
}

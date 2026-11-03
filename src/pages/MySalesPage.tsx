import { useState } from 'react';
import { Pause, Pencil, Play, Plus, Trash2, Package, Zap } from 'lucide-react';
import { Badge, Button, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui';
import ListingFormModal from '@/components/ListingFormModal';
import { useAccount } from '@/context/auth';
import { formatMoney } from '@/lib/format';
import { isFlashActive, LISTING_SELECT } from '@/lib/listings';
import { getErrorMessage } from '@/lib/errors';
import { useLoad, useNow } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Listing } from '@/lib/types';

type EditorState = { open: boolean; listing: Listing | null; startAsFlash: boolean };

function StatusBadge({ listing, now }: { listing: Listing; now: number }) {
  if (!listing.is_active) return <Badge>Paused</Badge>;
  if (listing.stock < 1) return <Badge tone="error">Sold out</Badge>;
  if (isFlashActive(listing, now)) return <Badge tone="warning">Flash sale</Badge>;
  return <Badge tone="success">Live</Badge>;
}

function SellerListingRow({
  listing,
  onEdit,
  onChanged,
}: {
  listing: Listing;
  onEdit: (listing: Listing) => void;
  onChanged: () => void;
}) {
  const now = useNow(1000);
  const [busy, setBusy] = useState<'toggle' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePaused = async () => {
    setBusy('toggle');
    setError(null);
    const { error: updateError } = await supabase
      .from('listings')
      .update({ is_active: !listing.is_active })
      .eq('id', listing.id);
    setBusy(null);
    if (updateError) {
      setError(getErrorMessage(updateError, 'We could not update this listing.'));
      return;
    }
    onChanged();
  };

  const remove = async () => {
    setBusy('delete');
    setError(null);
    const { error: deleteError } = await supabase.from('listings').delete().eq('id', listing.id);
    setBusy(null);
    if (deleteError) {
      setError(getErrorMessage(deleteError, 'We could not delete this listing.'));
      return;
    }
    onChanged();
  };

  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 transition-colors hover:border-zinc-700 sm:p-5">
      <div className="flex gap-4">
        <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-zinc-800 sm:block">
          {listing.image_url ? (
            <img src={listing.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-600">
              <Package className="h-6 w-6" aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge listing={listing} now={now} />
            <span className="text-xs text-zinc-500">{listing.category}</span>
          </div>
          <h3 className="truncate text-base font-semibold text-zinc-100">{listing.title}</h3>
          <p className="text-sm tabular-nums text-zinc-400">
            {formatMoney(isFlashActive(listing, now) && listing.flash_price_cents ? listing.flash_price_cents : listing.price_cents)}
            <span className="mx-2 text-zinc-600">|</span>
            {listing.stock} in stock
          </p>
        </div>
      </div>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
        <Button variant="secondary" className="px-3 py-2" onClick={() => onEdit(listing)}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </Button>
        <Button variant="secondary" className="px-3 py-2" onClick={togglePaused} loading={busy === 'toggle'}>
          {listing.is_active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {listing.is_active ? 'Pause' : 'Resume'}
        </Button>
        {confirmDelete ? (
          <>
            <Button variant="danger" className="px-3 py-2" onClick={remove} loading={busy === 'delete'}>
              Confirm delete
            </Button>
            <Button variant="ghost" className="px-3 py-2" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="px-3 py-2 text-rose-300 hover:text-rose-200" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

export default function MySalesPage() {
  const { profile } = useAccount();
  const [editor, setEditor] = useState<EditorState>({ open: false, listing: null, startAsFlash: false });

  const { data, error, loading, reload } = useLoad(
    async () =>
      unwrap<Listing[]>(
        await supabase
          .from('listings')
          .select(LISTING_SELECT)
          .eq('seller_id', profile.id)
          .order('created_at', { ascending: false })
      ),
    [profile.id]
  );

  const openEditor = (listing: Listing | null, startAsFlash = false) => setEditor({ open: true, listing, startAsFlash });
  const closeEditor = () => setEditor({ open: false, listing: null, startAsFlash: false });

  return (
    <div>
      <PageHeader
        eyebrow="Seller"
        title="My Sales"
        description="Manage the products you list. Paused listings stay hidden from buyers."
        action={
          profile.is_seller ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => openEditor(null, true)}>
                <Zap className="h-4 w-4 text-amber-300" aria-hidden />
                List flash sale
              </Button>
              <Button onClick={() => openEditor(null)}>
                <Plus className="h-4 w-4" aria-hidden />
                New listing
              </Button>
            </div>
          ) : undefined
        }
      />

      {!profile.is_seller && (
        <div className="mb-6">
          <Notice tone="info">
            Seller mode is off, so you cannot list products yet. Switch it on in My Seller Profile to start selling.
          </Notice>
        </div>
      )}

      {loading && <Spinner label="Loading your listings" />}
      {error && (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState
          icon={Package}
          title="No listings yet"
          text="Create your first product and it will appear in the marketplace once it is live."
          action={profile.is_seller ? <div className="flex flex-wrap justify-center gap-2"><Button variant="secondary" onClick={() => openEditor(null, true)}><Zap className="h-4 w-4 text-amber-300" aria-hidden />List a flash sale</Button><Button onClick={() => openEditor(null)}><Plus className="h-4 w-4" aria-hidden />Create a listing</Button></div> : undefined}
        />
      )}
      {data && data.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.map((listing) => (
            <SellerListingRow
              key={listing.id}
              listing={listing}
              onEdit={openEditor}
              onChanged={reload}
            />
          ))}
        </ul>
      )}

      {editor.open && (
        <ListingFormModal
          key={editor.listing?.id ?? 'new'}
          open={editor.open}
          listing={editor.listing}
          onClose={closeEditor}
          onSaved={reload}
          startAsFlash={editor.startAsFlash}
        />
      )}
    </div>
  );
}

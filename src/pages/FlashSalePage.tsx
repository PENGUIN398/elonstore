import { useMemo, useState } from 'react';
import { Clock, Zap } from 'lucide-react';
import { Button, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui';
import ListingCard from '@/components/ListingCard';
import ListingDetailModal from '@/components/ListingDetailModal';
import { formatCountdown } from '@/lib/format';
import { useLoad, useNow } from '@/lib/hooks';
import { LISTING_SELECT } from '@/lib/listings';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Listing } from '@/lib/types';
import type { PageId } from '@/lib/navigation';

export default function FlashSalePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [selected, setSelected] = useState<Listing | null>(null);
  const now = useNow(1000);

  const { data, error, loading, reload } = useLoad(
    async () =>
      unwrap<Listing[]>(
        await supabase
          .from('listings')
          .select(LISTING_SELECT)
          .eq('is_active', true)
          .not('flash_ends_at', 'is', null)
          .gt('flash_ends_at', new Date().toISOString())
          .order('flash_ends_at', { ascending: true })
      ),
    []
  );

  const live = useMemo(
    () => (data ?? []).filter((l) => l.flash_ends_at && new Date(l.flash_ends_at).getTime() > now),
    [data, now]
  );
  const soonest = live[0]?.flash_ends_at ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Limited time"
        title="Flash Sale"
        description="Discounted prices that disappear when the timer runs out. Buy before the countdown ends."
      />

      {soonest && (
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-zinc-950">
              <Zap className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-200">Next deal ends soon</p>
              <p className="text-xs text-zinc-400">{live.length} flash {live.length === 1 ? 'deal' : 'deals'} running now</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-amber-300">
            <Clock className="h-4 w-4" aria-hidden />
            <span className="text-xl font-bold tabular-nums">{formatCountdown(soonest, now)}</span>
          </div>
        </div>
      )}

      {loading && <Spinner label="Loading flash deals" />}
      {error && (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </div>
      )}
      {data && live.length === 0 && (
        <EmptyState
          icon={Zap}
          title="No flash deals right now"
          text="Check back soon. Sellers post limited-time prices here."
        />
      )}
      {live.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onOpen={setSelected} />
          ))}
        </div>
      )}

      <ListingDetailModal listing={selected} onClose={() => setSelected(null)} onPurchased={reload} onNavigate={onNavigate} />
    </div>
  );
}

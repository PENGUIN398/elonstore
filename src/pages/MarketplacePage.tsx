import { useState } from 'react';
import { Search, Store } from 'lucide-react';
import { EmptyState, Notice, PageHeader, Spinner, Button, inputClass } from '@/components/ui';
import ListingCard from '@/components/ListingCard';
import ListingDetailModal from '@/components/ListingDetailModal';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import { LISTING_SELECT } from '@/lib/listings';
import type { Listing } from '@/lib/types';
import type { PageId } from '@/lib/navigation';

const ALL_CATEGORIES = 'All';

export default function MarketplacePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [selected, setSelected] = useState<Listing | null>(null);

  const { data, error, loading, reload } = useLoad(
    async () =>
      unwrap<Listing[]>(
        await supabase
          .from('listings')
          .select(LISTING_SELECT)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
      ),
    []
  );

  const categories = [ALL_CATEGORIES, ...Array.from(new Set((data ?? []).map((l) => l.category))).sort()];
  const needle = query.trim().toLowerCase();
  const visible = (data ?? []).filter((l) => {
    if (category !== ALL_CATEGORIES && l.category !== category) return false;
    if (!needle) return true;
    return l.title.toLowerCase().includes(needle) || l.description.toLowerCase().includes(needle);
  });

  return (
    <div>
      <PageHeader
        eyebrow="Browse"
        title="Marketplace"
        description="Digital products and services from our sellers. Every purchase is protected by escrow."
      />

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services and products"
            className={`${inputClass} pl-10`}
            aria-label="Search services and products"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                category === c
                  ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && <Spinner label="Loading marketplace" />}
      {error && (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </div>
      )}
      {data && visible.length === 0 && (
        <EmptyState
          icon={Store}
          title="No products match"
          text="Try a different search or category."
        />
      )}
      {visible.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onOpen={setSelected} />
          ))}
        </div>
      )}

      <ListingDetailModal
        listing={selected}
        onClose={() => setSelected(null)}
        onPurchased={reload}
        onNavigate={onNavigate}
      />
    </div>
  );
}

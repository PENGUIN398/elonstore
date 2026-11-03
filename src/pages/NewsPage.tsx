import { useState } from 'react';
import { Newspaper } from 'lucide-react';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner, Badge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { NewsItem } from '@/lib/types';

export default function NewsPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(
    async () =>
      unwrap<NewsItem[]>(
        await supabase.from('news').select('*').order('published_at', { ascending: false })
      ),
    []
  );

  return (
    <div>
      <PageHeader eyebrow="Updates" title="News" description="Announcements, guides and promotions from elonstore." />
      {loading && <Spinner label="Loading news" />}
      {error && (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState icon={Newspaper} title="No news yet" text="Announcements will appear here." />
      )}
      {data && data.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {data.map((item) => {
            const open = openId === item.id;
            return (
              <Card key={item.id} className="flex flex-col gap-3 transition-colors hover:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="info">{item.category}</Badge>
                  <span className="text-xs text-zinc-500">{formatDate(item.published_at)}</span>
                </div>
                <h3 className="text-lg font-semibold leading-snug text-zinc-100">{item.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{open ? item.body : item.summary}</p>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="mt-auto self-start text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
                >
                  {open ? 'Show less' : 'Read more'}
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

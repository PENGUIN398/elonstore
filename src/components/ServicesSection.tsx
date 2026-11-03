import { useState } from 'react';
import { Pause, Play, Trash2, Wrench } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, Spinner } from '@/components/ui';
import ServiceForm from '@/components/ServiceForm';
import { useAccount } from '@/context/auth';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/query';
import type { Listing } from '@/lib/types';

export default function ServicesSection() {
  const { profile } = useAccount();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading, reload } = useLoad(
    async () =>
      unwrap<Listing[]>(
        await supabase
          .from('listings')
          .select('*')
          .eq('seller_id', profile.id)
          .eq('kind', 'service')
          .order('created_at', { ascending: false })
      ),
    [profile.id]
  );

  const runAction = async (id: string, action: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusyId(id);
    setActionError(null);
    const { error: actionErr } = await action();
    setBusyId(null);
    if (actionErr) {
      setActionError(getErrorMessage(actionErr, 'We could not update this service.'));
      return;
    }
    reload();
  };

  const togglePaused = (service: Listing) =>
    runAction(service.id, () =>
      supabase.from('listings').update({ is_active: !service.is_active }).eq('id', service.id)
    );

  const remove = (service: Listing) => {
    if (!window.confirm(`Delete "${service.title}"? Buyers will no longer see it.`)) return;
    runAction(service.id, () => supabase.from('listings').delete().eq('id', service.id));
  };

  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-zinc-100">My services</h2>
        <p className="text-sm text-zinc-400">
          Services you add appear in the marketplace straight away, under the Services category.
        </p>
      </div>

      {!profile.is_seller && (
        <Notice tone="info">Turn on seller mode above to start listing services.</Notice>
      )}

      {profile.is_seller && <ServiceForm onCreated={reload} />}

      {actionError && <Notice tone="error">{actionError}</Notice>}
      {loading && <Spinner label="Loading services" />}
      {error && (
        <div className="space-y-3">
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </div>
      )}
      {data && data.length === 0 && (
        <EmptyState icon={Wrench} title="No services yet" text="Services you add will be listed here." />
      )}
      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((service) => {
            const suffix = service.pricing_model === 'hourly' ? '/hr' : '';
            return (
              <li
                key={service.id}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={service.is_active ? 'success' : 'neutral'}>{service.is_active ? 'Live' : 'Paused'}</Badge>
                    <span className="text-xs text-zinc-500">
                      {service.pricing_model === 'hourly' ? 'Hourly' : 'Fixed'}
                      {service.delivery_days !== null && ` · ${service.delivery_days} day delivery`}
                    </span>
                  </div>
                  <p className="truncate text-sm font-semibold text-zinc-100">{service.title}</p>
                  <p className="text-sm tabular-nums text-emerald-300">
                    {formatMoney(service.price_cents)}
                    {suffix}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" className="px-3 py-2" loading={busyId === service.id} onClick={() => togglePaused(service)}>
                    {service.is_active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                    {service.is_active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="ghost" className="px-3 py-2 text-rose-300 hover:text-rose-200" disabled={busyId === service.id} onClick={() => remove(service)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

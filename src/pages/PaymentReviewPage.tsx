import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui';
import { useAccount } from '@/context/auth';
import { formatDateTime, formatMoney } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type PaymentSubmission = {
  id: string;
  user_id: string;
  amount_cents: number;
  txid: string;
  destination: 'wallet' | 'escrow';
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  handle: string;
  display_name: string;
};

type ProfileSummary = {
  id: string;
  handle: string;
  display_name: string;
};

export default function PaymentReviewPage() {
  const { isSupportAgent } = useAccount();
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('binance_payment_submissions')
      .select('id, user_id, amount_cents, txid, destination, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (queryError) {
      setError(getErrorMessage(queryError, 'We could not load payment reviews.'));
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Omit<PaymentSubmission, 'handle' | 'display_name'>[];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const profileResult = userIds.length
      ? await supabase.from('profiles').select('id, handle, display_name').in('id', userIds)
      : { data: [], error: null };

    if (profileResult.error) {
      setError(getErrorMessage(profileResult.error, 'We could not load payment account details.'));
      setLoading(false);
      return;
    }

    const profiles = (profileResult.data ?? []) as ProfileSummary[];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    setSubmissions(
      rows.map((row) => {
        const profile = profileById.get(row.user_id);
        return {
          ...row,
          handle: profile?.handle ?? 'Unknown account',
          display_name: profile?.display_name ?? '',
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isSupportAgent) void loadSubmissions();
  }, [isSupportAgent, loadSubmissions]);

  const review = async (submissionId: string, decision: 'confirm' | 'reject') => {
    setSavingId(submissionId);
    setError(null);
    const { error: reviewError } = await supabase.rpc('review_binance_payment', {
      p_submission_id: submissionId,
      p_decision: decision,
    });
    if (reviewError) {
      setError(getErrorMessage(reviewError, 'We could not update this payment review.'));
    } else {
      setSubmissions((current) => current.filter((submission) => submission.id !== submissionId));
    }
    setSavingId(null);
  };

  if (!isSupportAgent) {
    return <Notice tone="error">Support agent access is required.</Notice>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Payment reviews"
        description="Confirm Binance payments after checking the TXID. Confirmed funds go to the account that submitted the payment."
      />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
      {loading ? <Spinner label="Loading payment reviews" /> : submissions.length === 0 ? (
        <EmptyState icon={Clock3} title="No pending payments" text="New TXID submissions will appear here for review." />
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <Card key={submission.id} className="border-cyan-400/15">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-zinc-100">@{submission.handle}</h2>
                    <Badge tone="warning">Pending</Badge>
                    <Badge tone="neutral">{submission.destination}</Badge>
                  </div>
                  {submission.display_name && <p className="mt-1 text-sm text-zinc-400">{submission.display_name}</p>}
                  <p className="mt-3 text-2xl font-bold tabular-nums text-cyan-200">{formatMoney(submission.amount_cents)}</p>
                  <p className="mt-2 break-all font-mono text-xs text-zinc-500">TXID: {submission.txid}</p>
                  <p className="mt-1 text-xs text-zinc-600">Submitted {formatDateTime(submission.created_at)}</p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <Button
                    variant="secondary"
                    loading={savingId === submission.id}
                    disabled={savingId !== null}
                    onClick={() => void review(submission.id, 'reject')}
                  >
                    <X className="h-4 w-4" aria-hidden /> Reject
                  </Button>
                  <Button
                    loading={savingId === submission.id}
                    disabled={savingId !== null}
                    onClick={() => void review(submission.id, 'confirm')}
                  >
                    <Check className="h-4 w-4" aria-hidden /> Confirm & credit
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

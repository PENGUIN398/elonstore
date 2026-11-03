import { useEffect, useState, type FormEvent } from 'react';
import { Inbox as InboxIcon, Send } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Spinner, inputClass } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type InboxThread = {
  id: string;
  subject: string;
  status: 'open' | 'closed';
  user_id: string;
  updated_at: string;
};

type InboxMessage = {
  id: string;
  sender_type: 'customer' | 'agent';
  body: string;
  created_at: string;
};

type CustomerName = { id: string; handle: string; display_name: string };

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [customers, setCustomers] = useState<Record<string, CustomerName>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = async () => {
    const { data, error: queryError } = await supabase
      .from('support_threads')
      .select('id, subject, status, user_id, updated_at')
      .order('updated_at', { ascending: false });
    if (queryError) {
      setError(getErrorMessage(queryError, 'We could not load your inbox.'));
      setLoading(false);
      return;
    }
    const nextThreads = (data ?? []) as InboxThread[];
    setThreads(nextThreads);
    const customerIds = [...new Set(nextThreads.map((thread) => thread.user_id))];
    if (customerIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, handle, display_name')
        .in('id', customerIds);
      setCustomers(Object.fromEntries(((profileData ?? []) as CustomerName[]).map((item) => [item.id, item])));
    }
    setSelectedId((current) => (current && nextThreads.some((thread) => thread.id === current) ? current : nextThreads[0]?.id ?? null));
    setLoading(false);
  };

  const loadMessages = async (threadId: string) => {
    setMessagesLoading(true);
    const { data, error: queryError } = await supabase
      .from('support_messages')
      .select('id, sender_type, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (queryError) setError(getErrorMessage(queryError, 'We could not load this conversation.'));
    else setMessages((data ?? []) as InboxMessage[]);
    setMessagesLoading(false);
  };

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId]);

  const handleReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId) return;
    setError(null);
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('send_agent_support_message', {
      p_thread_id: selectedId,
      p_message: draft,
    });
    if (rpcError) {
      setError(getErrorMessage(rpcError, 'We could not send your reply.'));
    } else {
      setDraft('');
      await Promise.all([loadMessages(selectedId), loadThreads()]);
    }
    setSaving(false);
  };

  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null;
  const customerLabel = (userId: string) => {
    const customer = customers[userId];
    return customer ? customer.display_name || `@${customer.handle}` : 'Customer';
  };

  return (
    <div>
      <PageHeader
        eyebrow="Agent inbox"
        title="Customer inbox"
        description="Private conversations from customers. Only support agents can see this page."
      />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
      {loading ? <Spinner label="Loading inbox" /> : threads.length === 0 ? (
        <EmptyState icon={InboxIcon} title="No customer messages yet" text="When a customer opens a support conversation, it will appear here." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit p-3">
            <p className="mb-3 px-2 text-sm font-semibold text-zinc-200">Conversations</p>
            <div className="space-y-1">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => { setSelectedId(thread.id); setError(null); }}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedId === thread.id ? 'bg-emerald-400/10 ring-1 ring-emerald-400/20' : 'hover:bg-zinc-800/70'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{thread.subject}</span>
                    <Badge tone={thread.status === 'open' ? 'success' : 'neutral'}>{thread.status}</Badge>
                  </div>
                  <span className="mt-1 block truncate text-xs text-zinc-500">{customerLabel(thread.user_id)} · {formatDateTime(thread.updated_at)}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="min-h-[480px]">
            {selectedThread && (
              <div className="flex min-h-[440px] flex-col">
                <div className="border-b border-zinc-800 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="truncate text-lg font-semibold text-zinc-100">{selectedThread.subject}</h2>
                    <Badge tone={selectedThread.status === 'open' ? 'success' : 'neutral'}>{selectedThread.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">From {customerLabel(selectedThread.user_id)}</p>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto py-5">
                  {messagesLoading ? <Spinner label="Loading messages" /> : messages.map((message) => (
                    <div key={message.id} className={`flex ${message.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.sender_type === 'agent' ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-800 text-zinc-100'}`}>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                        <p className={`mt-2 text-[11px] ${message.sender_type === 'agent' ? 'text-zinc-800/70' : 'text-zinc-500'}`}>
                          {message.sender_type === 'agent' ? 'You' : 'Customer'} · {formatDateTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedThread.status === 'open' ? (
                  <form onSubmit={handleReply} className="flex gap-2 border-t border-zinc-800 pt-4">
                    <textarea className={`${inputClass} min-h-12 resize-none`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply..." aria-label="Write a reply" />
                    <Button type="submit" loading={saving} disabled={!draft.trim()} className="self-end px-3">
                      <Send className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Send reply</span>
                    </Button>
                  </form>
                ) : (
                  <p className="border-t border-zinc-800 pt-4 text-sm text-zinc-500">This conversation is closed.</p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

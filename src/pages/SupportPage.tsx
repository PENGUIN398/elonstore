import { useEffect, useState, type FormEvent } from 'react';
import { LifeBuoy, MessageCircle, Send } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Notice, PageHeader, Spinner, inputClass } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type SupportThread = {
  id: string;
  subject: string;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
};

type SupportMessage = {
  id: string;
  thread_id: string;
  sender_type: 'customer' | 'agent';
  body: string;
  created_at: string;
};

export default function SupportPage() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState('');
  const [newThread, setNewThread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('support_threads')
      .select('id, subject, status, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (queryError) {
      setError(getErrorMessage(queryError, 'We could not load your support conversations.'));
    } else {
      const nextThreads = (data ?? []) as SupportThread[];
      setThreads(nextThreads);
      setSelectedId((current) => current && nextThreads.some((thread) => thread.id === current) ? current : nextThreads[0]?.id ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessagesLoading(true);
    void supabase
      .from('support_messages')
      .select('id, thread_id, sender_type, body, created_at')
      .eq('thread_id', selectedId)
      .order('created_at', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(getErrorMessage(queryError, 'We could not load this conversation.'));
        else setMessages((data ?? []) as SupportMessage[]);
        setMessagesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc('create_support_thread', {
      p_subject: subject,
      p_message: draft,
    });
    if (rpcError) {
      setError(getErrorMessage(rpcError, 'We could not open your support conversation.'));
    } else {
      setSubject('');
      setDraft('');
      setNewThread(false);
      await loadThreads();
      setSelectedId(data as string);
    }
    setSaving(false);
  };

  const handleReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId) return;
    setError(null);
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('send_support_message', {
      p_thread_id: selectedId,
      p_message: draft,
    });
    if (rpcError) {
      setError(getErrorMessage(rpcError, 'We could not send your message.'));
    } else {
      setDraft('');
      const { data } = await supabase
        .from('support_messages')
        .select('id, thread_id, sender_type, body, created_at')
        .eq('thread_id', selectedId)
        .order('created_at', { ascending: true });
      setMessages((data ?? []) as SupportMessage[]);
      await loadThreads();
    }
    setSaving(false);
  };

  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Help center"
        title="Support & disputes"
        description="Open a private conversation with our support team about an order, payment, or dispute."
        action={<Button onClick={() => { setNewThread(true); setSelectedId(null); setError(null); }}>New conversation</Button>}
      />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
      {loading ? <Spinner label="Loading support" /> : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit p-3">
            <div className="mb-3 flex items-center gap-2 px-2 py-1 text-sm font-semibold text-zinc-200">
              <MessageCircle className="h-4 w-4 text-emerald-300" aria-hidden /> Your conversations
            </div>
            {threads.length === 0 ? (
              <p className="px-2 py-5 text-sm leading-relaxed text-zinc-500">No conversations yet. Open one when you need help.</p>
            ) : (
              <div className="space-y-1">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => { setSelectedId(thread.id); setNewThread(false); setError(null); }}
                    className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedId === thread.id ? 'bg-emerald-400/10 ring-1 ring-emerald-400/20' : 'hover:bg-zinc-800/70'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-100">{thread.subject}</span>
                      <Badge tone={thread.status === 'open' ? 'success' : 'neutral'}>{thread.status}</Badge>
                    </div>
                    <span className="mt-1 block text-xs text-zinc-500">Updated {formatDateTime(thread.updated_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="min-h-[480px]">
            {newThread ? (
              <form onSubmit={handleCreate} className="mx-auto max-w-xl space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300"><LifeBuoy className="h-5 w-5" aria-hidden /></div>
                  <div><h2 className="text-lg font-semibold text-zinc-100">Start a support conversation</h2><p className="text-sm text-zinc-500">Tell us what happened and include your order details if relevant.</p></div>
                </div>
                <Field label="Subject"><input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Payment or order issue" maxLength={120} /></Field>
                <Field label="Message"><textarea className={`${inputClass} min-h-32 resize-y`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the issue..."></textarea></Field>
                <Button type="submit" loading={saving} className="w-full"><Send className="h-4 w-4" aria-hidden /> Open conversation</Button>
              </form>
            ) : selectedThread ? (
              <div className="flex h-full min-h-[440px] flex-col">
                <div className="border-b border-zinc-800 pb-4"><div className="flex items-center justify-between gap-3"><h2 className="truncate text-lg font-semibold text-zinc-100">{selectedThread.subject}</h2><Badge tone={selectedThread.status === 'open' ? 'success' : 'neutral'}>{selectedThread.status}</Badge></div><p className="mt-1 text-xs text-zinc-500">Private support conversation</p></div>
                <div className="flex-1 space-y-4 overflow-y-auto py-5">
                  {messagesLoading ? <Spinner label="Loading messages" /> : messages.map((message) => <div key={message.id} className={`flex ${message.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.sender_type === 'customer' ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-800 text-zinc-100'}`}><p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p><p className={`mt-2 text-[11px] ${message.sender_type === 'customer' ? 'text-zinc-800/70' : 'text-zinc-500'}`}>{message.sender_type === 'customer' ? 'You' : 'Support agent'} · {formatDateTime(message.created_at)}</p></div></div>)}
                </div>
                {selectedThread.status === 'open' && <form onSubmit={handleReply} className="flex gap-2 border-t border-zinc-800 pt-4"><textarea className={`${inputClass} min-h-12 resize-none`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply..." aria-label="Write a reply"></textarea><Button type="submit" loading={saving} className="self-end px-3"><Send className="h-4 w-4" aria-hidden /><span className="sr-only">Send reply</span></Button></form>}
              </div>
            ) : (
              <EmptyState icon={LifeBuoy} title="Need help?" text="Start a private support conversation and our team will reply here." action={<Button onClick={() => setNewThread(true)}>Open support chat</Button>} />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

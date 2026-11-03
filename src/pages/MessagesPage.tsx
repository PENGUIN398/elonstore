import { useEffect, useState, type FormEvent } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Spinner, inputClass } from '@/components/ui';
import { useAccount } from '@/context/auth';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/types';

type ChatMessage = { id: string; sender_id: string; sender_email: string; body: string; created_at: string };
type DirectConversation = { id: string; buyer_id: string; seller_id: string; updated_at: string };
type ChatThread = { key: string; conversationId: string; title: string; subtitle: string; buyerId: string; sellerId: string | null; direct: boolean };

export default function MessagesPage() {
  const { profile, session } = useAccount();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = async () => {
    setLoading(true);
    const [buyer, seller, direct] = await Promise.all([
      supabase.from('orders').select('*').eq('buyer_id', profile.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('orders').select('*').eq('seller_id', profile.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('order_conversations').select('id, buyer_id, seller_id, updated_at').is('order_id', null).or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`).order('updated_at', { ascending: false }).limit(100),
    ]);
    if (buyer.error || seller.error || direct.error) setError('We could not load your conversations.');

    const orders = [...((buyer.data ?? []) as Order[]), ...((seller.data ?? []) as Order[])].filter((order, index, all) => all.findIndex((item) => item.id === order.id) === index);
    const orderThreads: ChatThread[] = orders.map((order) => ({
      key: `order:${order.id}`,
      conversationId: order.id,
      title: order.listing_title,
      subtitle: `Order ${order.id.slice(0, 8).toUpperCase()}`,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      direct: false,
    }));
    const directThreads: ChatThread[] = ((direct.data ?? []) as DirectConversation[]).map((conversation) => ({
      key: `direct:${conversation.id}`,
      conversationId: conversation.id,
      title: 'Seller conversation',
      subtitle: 'Direct message',
      buyerId: conversation.buyer_id,
      sellerId: conversation.seller_id,
      direct: true,
    }));
    const merged = [...directThreads, ...orderThreads];
    setThreads(merged);
    setSelectedKey((current) => current && merged.some((thread) => thread.key === current) ? current : merged[0]?.key ?? null);
    setLoading(false);
  };

  const loadMessages = async (thread: ChatThread) => {
    setMessagesLoading(true);
    const conversationId = thread.direct
      ? thread.conversationId
      : (await supabase.from('order_conversations').select('id').eq('order_id', thread.conversationId).maybeSingle()).data?.id;
    if (!conversationId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    const { data, error: messageError } = await supabase.from('order_messages').select('id, sender_id, sender_email, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    if (messageError) setError('We could not load this conversation.');
    else setMessages((data ?? []) as ChatMessage[]);
    setMessagesLoading(false);
  };

  useEffect(() => { void loadThreads(); }, [profile.id]);
  const selectedThread = threads.find((thread) => thread.key === selectedKey) ?? null;
  useEffect(() => { if (selectedThread) void loadMessages(selectedThread); else setMessages([]); }, [selectedKey, threads]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedThread || !draft.trim()) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = selectedThread.direct
      ? await supabase.rpc('send_seller_message', { p_conversation_id: selectedThread.conversationId, p_body: draft })
      : await supabase.rpc('send_order_message', { p_order_id: selectedThread.conversationId, p_body: draft });
    if (rpcError) setError(getErrorMessage(rpcError, 'We could not send your message.'));
    else { setDraft(''); await loadMessages(selectedThread); }
    setSaving(false);
  };

  const currentEmail = session.user.email ?? 'Signed-in account';
  const isBuyer = selectedThread?.buyerId === profile.id;

  return (
    <div>
      <PageHeader eyebrow="Private chat" title="Messages" description="All messages between buyers and sellers appear here and in Notifications." />
      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
      {loading ? <Spinner label="Loading conversations" /> : threads.length === 0 ? <EmptyState icon={MessageCircle} title="No conversations yet" text="Messages become available after you contact a seller or place an order." /> : <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-3"><p className="mb-3 px-2 text-sm font-semibold text-zinc-200">Conversations</p><div className="space-y-1">{threads.map((thread) => <button key={thread.key} type="button" onClick={() => { setSelectedKey(thread.key); setError(null); }} className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedKey === thread.key ? 'bg-emerald-400/10 ring-1 ring-emerald-400/20' : 'hover:bg-zinc-800/70'}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-zinc-100">{thread.title}</span><Badge tone={thread.buyerId === profile.id ? 'info' : 'warning'}>{thread.buyerId === profile.id ? 'Buying' : 'Selling'}</Badge></div><span className="mt-1 block text-xs text-zinc-500">{thread.subtitle}</span></button>)}</div></Card>
        <Card className="min-h-[500px]">{selectedThread && <div className="flex min-h-[460px] flex-col"><div className="border-b border-zinc-800 pb-4"><h2 className="text-lg font-semibold text-zinc-100">{selectedThread.title}</h2><p className="mt-1 text-xs text-zinc-500">{selectedThread.subtitle} · Messages are visible only to the buyer and seller</p></div><div className="flex-1 space-y-4 overflow-y-auto py-5">{messagesLoading ? <Spinner label="Loading messages" /> : messages.length === 0 ? <div className="flex h-full min-h-48 items-center justify-center text-center text-sm text-zinc-500">Start the conversation.</div> : messages.map((message) => { const mine = message.sender_id === profile.id; return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-800 text-zinc-100'}`}><p className="mb-1 text-[11px] font-semibold opacity-70">{message.sender_email}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p><p className="mt-2 text-[11px] opacity-60">{formatDateTime(message.created_at)}</p></div></div>; })}</div><form onSubmit={handleSend} className="flex gap-2 border-t border-zinc-800 pt-4"><textarea className={`${inputClass} min-h-12 resize-none`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${isBuyer ? 'seller' : 'buyer'}...`} aria-label="Message" /><Button type="submit" loading={saving} className="self-end px-3"><Send className="h-4 w-4" aria-hidden /><span className="sr-only">Send message</span></Button></form><p className="mt-2 text-[11px] text-zinc-600">Sending as {currentEmail}</p></div>}</Card>
      </div>}
    </div>
  );
}

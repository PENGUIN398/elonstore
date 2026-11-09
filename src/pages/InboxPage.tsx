import { useEffect, useState, type FormEvent } from 'react';
import { Inbox as InboxIcon, Send, Store } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Spinner, inputClass } from '@/components/ui';
import { useAccount } from '@/context/auth';
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

type SellerConversation = {
  conversation_id: string;
  order_id: string | null;
  seller_id: string;
  seller_handle: string;
  seller_display_name: string;
  seller_email: string;
  buyer_id: string;
  buyer_handle: string;
  buyer_display_name: string;
  buyer_email: string;
  last_message_body: string;
  last_message_at: string;
  message_count: number;
};

type SellerMessageDetail = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_email: string;
  sender_handle: string;
  sender_display_name: string;
  body: string;
  created_at: string;
};

type Tab = 'support' | 'seller-messages';

export default function InboxPage() {
  const { isSupportAgent } = useAccount();
  const [tab, setTab] = useState<Tab>('support');

  // --- Support inbox state ---
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [customers, setCustomers] = useState<Record<string, CustomerName>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Seller messages state ---
  const [sellerConvs, setSellerConvs] = useState<SellerConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [sellerMsgs, setSellerMsgs] = useState<SellerMessageDetail[]>([]);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerMsgsLoading, setSellerMsgsLoading] = useState(false);
  const [sellerError, setSellerError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // =====================
  // Support inbox loaders
  // =====================
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

  // =====================
  // Seller messages loaders
  // =====================
  const loadSellerConversations = async () => {
    setSellerLoading(true);
    setSellerError(null);
    const { data, error: rpcError } = await supabase.rpc('get_seller_message_overview');
    if (rpcError) {
      setSellerError(getErrorMessage(rpcError, 'We could not load seller conversations.'));
      setSellerConvs([]);
    } else {
      const rows = (data ?? []) as SellerConversation[];
      setSellerConvs(rows);
      setSelectedConvId((current) => (current && rows.some((r) => r.conversation_id === current) ? current : rows[0]?.conversation_id ?? null));
    }
    setSellerLoading(false);
  };

  const loadSellerMessages = async (convId: string) => {
    setSellerMsgsLoading(true);
    setSellerError(null);
    const { data, error: rpcError } = await supabase.rpc('get_seller_message_detail', {
      p_conversation_id: convId,
    });
    if (rpcError) {
      setSellerError(getErrorMessage(rpcError, 'We could not load this conversation.'));
      setSellerMsgs([]);
    } else {
      setSellerMsgs((data ?? []) as SellerMessageDetail[]);
    }
    setSellerMsgsLoading(false);
  };

  useEffect(() => {
    if (tab === 'seller-messages' && sellerConvs.length === 0 && !sellerLoading) {
      void loadSellerConversations();
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'seller-messages' && selectedConvId) {
      void loadSellerMessages(selectedConvId);
    } else {
      setSellerMsgs([]);
    }
  }, [selectedConvId, tab]);

  // =====================
  // Derived values
  // =====================
  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null;
  const customerLabel = (userId: string) => {
    const customer = customers[userId];
    return customer ? customer.display_name || `@${customer.handle}` : 'Customer';
  };

  const selectedSellerConv = sellerConvs.find((c) => c.conversation_id === selectedConvId) ?? null;

  const filteredSellerConvs = search.trim()
    ? sellerConvs.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.seller_handle?.toLowerCase().includes(q) ||
          c.seller_display_name?.toLowerCase().includes(q) ||
          c.seller_email?.toLowerCase().includes(q) ||
          c.buyer_handle?.toLowerCase().includes(q) ||
          c.buyer_display_name?.toLowerCase().includes(q) ||
          c.buyer_email?.toLowerCase().includes(q)
        );
      })
    : sellerConvs;

  return (
    <div>
      <PageHeader
        eyebrow="Agent inbox"
        title="Customer inbox"
        description="Private conversations from customers and marketplace seller activity. Only support agents can see this page."
      />

      {/* Tab switcher */}
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('support')}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === 'support' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100'}`}
        >
          <InboxIcon className="mr-2 inline h-4 w-4" aria-hidden />
          Support conversations
        </button>
        <button
          type="button"
          onClick={() => setTab('seller-messages')}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === 'seller-messages' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100'}`}
        >
          <Store className="mr-2 inline h-4 w-4" aria-hidden />
          Seller messages
        </button>
      </div>

      {tab === 'support' && (
        <>
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
        </>
      )}

      {tab === 'seller-messages' && (
        <>
          {sellerError && <div className="mb-5"><Notice tone="error">{sellerError}</Notice></div>}
          {sellerLoading ? <Spinner label="Loading seller conversations" /> : filteredSellerConvs.length === 0 ? (
            <EmptyState
              icon={Store}
              title={search.trim() ? 'No matching conversations' : 'No seller messages yet'}
              text={search.trim() ? 'Try a different search term.' : 'When a customer messages a seller, the conversation will appear here.'}
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
              {/* Conversation list */}
              <Card className="h-fit p-3">
                <div className="mb-3 px-1">
                  <p className="mb-2 text-sm font-semibold text-zinc-200">Seller conversations ({filteredSellerConvs.length})</p>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by seller or buyer..."
                    className={`${inputClass} text-xs`}
                    aria-label="Search conversations"
                  />
                </div>
                <div className="max-h-[600px] space-y-1 overflow-y-auto">
                  {filteredSellerConvs.map((conv) => (
                    <button
                      key={conv.conversation_id}
                      type="button"
                      onClick={() => { setSelectedConvId(conv.conversation_id); setSellerError(null); }}
                      className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedConvId === conv.conversation_id ? 'bg-emerald-400/10 ring-1 ring-emerald-400/20' : 'hover:bg-zinc-800/70'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-zinc-100">
                          {conv.seller_display_name || `@${conv.seller_handle}`}
                        </span>
                        <Badge tone="info">{conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}</Badge>
                      </div>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        {conv.seller_email}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-600">
                        From: {conv.buyer_email}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-600">
                        {formatDateTime(conv.last_message_at)}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Message detail */}
              <Card className="min-h-[480px]">
                {selectedSellerConv && (
                  <div className="flex min-h-[440px] flex-col">
                    <div className="border-b border-zinc-800 pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold text-zinc-100">
                          Seller {selectedSellerConv.seller_display_name || `@${selectedSellerConv.seller_handle}`}
                        </h2>
                        {selectedSellerConv.order_id && <Badge tone="neutral">Order</Badge>}
                      </div>
                      <div className="mt-2 space-y-0.5 text-xs text-zinc-500">
                        <p>
                          <span className="text-zinc-400">Seller:</span> {selectedSellerConv.seller_display_name || `@${selectedSellerConv.seller_handle}`} ({selectedSellerConv.seller_email})
                        </p>
                        <p>
                          <span className="text-zinc-400">Buyer:</span> {selectedSellerConv.buyer_display_name || `@${selectedSellerConv.buyer_handle}`} ({selectedSellerConv.buyer_email})
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 space-y-4 overflow-y-auto py-5">
                      {sellerMsgsLoading ? <Spinner label="Loading messages" /> : sellerMsgs.length === 0 ? (
                        <div className="flex h-full min-h-48 items-center justify-center text-sm text-zinc-500">No messages found.</div>
                      ) : sellerMsgs.map((msg) => {
                        const isSeller = msg.sender_id === selectedSellerConv.seller_id;
                        return (
                          <div key={msg.message_id} className={`flex ${isSeller ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${isSeller ? 'bg-emerald-400 text-zinc-950' : 'bg-zinc-800 text-zinc-100'}`}>
                              <p className="mb-1 text-[11px] font-semibold opacity-70">
                                {msg.sender_email}
                              </p>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
                              <p className="mt-2 text-[11px] opacity-60">{formatDateTime(msg.created_at)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t border-zinc-800 pt-3">
                      <p className="text-[11px] text-zinc-600">Read-only monitoring — agents cannot reply to seller conversations from here.</p>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Bell, CheckCheck, MessageSquare, ShoppingBag, LifeBuoy, X } from 'lucide-react';
import { useAccount } from '@/context/auth';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/lib/navigation';

type AppNotification = {
  id: string;
  kind: 'order' | 'message' | 'support';
  title: string;
  body: string;
  order_id: string | null;
  created_at: string;
  read_at: string | null;
};

export default function NotificationBell({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { profile, isSupportAgent } = useAccount();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, kind, title, body, order_id, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications((data ?? []) as AppNotification[]);
  };

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 15000);
    return () => window.clearInterval(timer);
  }, [profile.id]);

  const unread = notifications.filter((notification) => !notification.read_at).length;

  const markRead = async (notification: AppNotification) => {
    if (!notification.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    }
    setOpen(false);
    if (notification.kind === 'message') onNavigate('messages');
    else if (notification.kind === 'support') onNavigate(isSupportAgent ? 'inbox' : 'support');
    else onNavigate('delivery-center');
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100">
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-zinc-950">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><p className="text-sm font-semibold text-zinc-100">Notifications</p><div className="flex items-center gap-2">{unread > 0 && <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-emerald-200"><CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read</button>}<button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"><X className="h-4 w-4" aria-hidden /></button></div></div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? <p className="px-4 py-8 text-center text-sm text-zinc-500">You have no notifications.</p> : notifications.map((notification) => <button key={notification.id} type="button" onClick={() => void markRead(notification)} className={`flex w-full gap-3 border-b border-zinc-800/80 px-4 py-3 text-left transition hover:bg-zinc-800/70 ${notification.read_at ? 'opacity-70' : 'bg-emerald-400/[0.04]'}`}><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-emerald-300">{notification.kind === 'message' ? <MessageSquare className="h-4 w-4" aria-hidden /> : notification.kind === 'support' ? <LifeBuoy className="h-4 w-4" aria-hidden /> : <ShoppingBag className="h-4 w-4" aria-hidden />}</span><span className="min-w-0"><span className="block text-sm font-semibold text-zinc-100">{notification.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">{notification.body}</span><span className="mt-1 block text-[11px] text-zinc-600">{formatDateTime(notification.created_at)}</span></span></button>)}
          </div>
        </div>
      )}
    </div>
  );
}

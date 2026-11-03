import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { PROFILE_SELECT } from '@/lib/types';
import { AccountContext, type AccountContextValue } from '@/context/auth';

type AccountState = {
  session: Session;
  profile: Profile;
  balanceCents: number;
  isSupportAgent: boolean;
};

export type AuthGate =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & AccountState);

async function loadAccount(session: Session): Promise<AccountState> {
  const userId = session.user.id;
  const [profileRes, walletRes, agentRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle(),
    supabase.from('wallets').select('balance_cents').eq('user_id', userId).maybeSingle(),
    supabase.rpc('is_support_agent'),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (walletRes.error) throw walletRes.error;
  if (agentRes.error) throw agentRes.error;
  if (!profileRes.data) throw new Error('Your account profile is still being created. Please try again in a moment.');
  return {
    session,
    profile: profileRes.data as Profile,
    balanceCents: (walletRes.data?.balance_cents as number | undefined) ?? 0,
    isSupportAgent: agentRes.data === true,
  };
}

export function useAuthGate(): [AuthGate, () => void] {
  const [gate, setGate] = useState<AuthGate>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    const resolve = (session: Session | null) => {
      if (!session) {
        setGate({ status: 'signed-out' });
        return;
      }
      loadAccount(session)
        .then((account) => {
          if (active) setGate({ status: 'ready', ...account });
        })
        .catch((err: unknown) => {
          if (!active) return;
          const message = err instanceof Error ? err.message : 'We could not load your account.';
          setGate({ status: 'error', message });
        });
    };

    supabase.auth.getSession().then(({ data }) => resolve(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      (async () => {
        if (!active) return;
        if (event === 'SIGNED_OUT' || !session) {
          setGate({ status: 'signed-out' });
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          resolve(session);
        }
      })();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [gate, retry];
}

export function AccountProvider({
  initial,
  children,
}: {
  initial: AccountState;
  children: ReactNode;
}) {
  const [account, setAccount] = useState<AccountState>(initial);

  const refreshAccount = useCallback(async () => {
    const next = await loadAccount(account.session);
    setAccount(next);
  }, [account.session]);

  const setProfile = useCallback((profile: Profile) => {
    setAccount((prev) => ({ ...prev, profile }));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      session: account.session,
      profile: account.profile,
      balanceCents: account.balanceCents,
      isSupportAgent: account.isSupportAgent,
      setProfile,
      refreshAccount,
      signOut,
    }),
    [account, setProfile, refreshAccount, signOut]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

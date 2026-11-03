import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';

export type AccountContextValue = {
  session: Session;
  profile: Profile;
  balanceCents: number;
  isSupportAgent: boolean;
  setProfile: (profile: Profile) => void;
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error('useAccount must be used inside AccountProvider');
  }
  return value;
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, ApiError, loadToken, saveToken, type Account, type Pet } from '@/lib/api';

type MeBrief = {
  account: Account;
  listings: Pick<Pet, 'id' | 'slug' | 'active' | 'listing_type' | 'sold_at'>[];
};

type AuthState = {
  ready: boolean;
  account: Account | null;
  mySlugs: Set<string>;
  sendCode: (phone: string) => Promise<void>;
  verify: (phone: string, code: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

// Sign in is the website's: a WhatsApp number and a 6-digit code sent to it.
// The app keeps the session token in the phone's secure storage.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [mySlugs, setMySlugs] = useState<Set<string>>(new Set());

  const forget = useCallback(async () => {
    await saveToken(null);
    setAccount(null);
    setMySlugs(new Set());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api<MeBrief>('/api/me?brief=1');
      setAccount(me.account);
      setMySlugs(new Set((me.listings || []).map((l) => l.slug)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await forget();
    }
  }, [forget]);

  useEffect(() => {
    (async () => {
      if (await loadToken()) await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const sendCode = useCallback(async (phone: string) => {
    await api('/api/auth/code', { phone });
  }, []);

  const verify = useCallback(
    async (phone: string, code: string, name: string) => {
      const r = await api<{ account: Account; token?: string }>('/api/auth/verify', { phone, code, name, app: true });
      if (!r.token) throw new ApiError('Sign in is not available in the app yet. Try again later.', 503, null);
      await saveToken(r.token);
      setAccount(r.account);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', {}).catch(() => {});
    await forget();
  }, [forget]);

  return (
    <Ctx.Provider value={{ ready, account, mySlugs, sendCode, verify, signOut, refresh }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (email, password) => {
    const data = await api('/auth/signin', { method: 'POST', body: { email, password } });
    setUser(data.user);
    return data.user;
  }, []);

  const signUp = useCallback(async (fields) => {
    const data = await api('/auth/signup', { method: 'POST', body: fields });
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/signout', { method: 'POST' });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut, setUser }),
    [user, ready, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

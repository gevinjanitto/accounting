import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = (token, u) => { tokenStore.set(token); setUser(u); };
  const signOut = async () => {
    try { await api.post("/auth/logout"); } catch { /* sesi sudah habis */ }
    tokenStore.clear();
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, setUser, loading, signIn, signOut, refresh }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

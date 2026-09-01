"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { applyTheme, isTheme } from "@/lib/theme";

interface User {
  id: string;
  username: string;
  display_name: string;
  email?: string;
  phone?: string | null;
  bio?: string;
  avatar_color: string;
  avatar: Record<string, string> | null;
  theme?: string;
  is_verified: number;
  role: string;
  community_count?: number;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUser(data.user);
      // The account's saved theme wins over this device's localStorage echo.
      if (data.user && isTheme(data.user.theme)) {
        applyTheme(data.user.theme);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/me", { method: "DELETE" });
    setUser(null);
    // Hard navigation on purpose: a full document load drops every piece of
    // logged-in client state, which router.push would keep in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

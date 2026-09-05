"use client";

// The app's own session, replacing Clerk.
//
// Deliberately keeps the hook names and shapes the pages already used
// (useAuth/useUser/getToken), so swapping off Clerk was a one-line import
// change in each page rather than a rewrite of every data-loading effect.
//
// The token is a JWT minted by POST /auth/login. It is held in localStorage
// so an installed PWA stays signed in across app launches — a supervisor
// re-authenticating every time they reopen the app on the floor would not be
// used. That does mean the token is readable by any script running on this
// origin; the app ships no third-party scripts, and the backend re-checks
// `active` and `tokenVersion` on every request, so a stolen token stops
// working the moment the owner revokes that user.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const TOKEN_KEY = "stoneos.token";
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export interface SessionUser {
  id: string;
  username: string;
  name?: string;
  email: string | null;
  role: string;
  factoryId: string;
}

interface SessionContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: SessionUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function readStoredToken(): string | null {
  // Safari in private mode throws on localStorage access rather than
  // returning null, which would otherwise take the whole app down on load.
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — the session simply won't survive a reload */
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // On first load, a stored token is treated as a claim to verify, not as
  // proof. /auth/me re-runs the guard, so a token belonging to a revoked user
  // is discarded here rather than leaving a signed-in-looking shell.
  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) {
      setIsLoaded(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (cancelled) return;
        if (res.ok) {
          setUser(await res.json());
          setToken(stored);
        } else {
          writeStoredToken(null);
        }
      } catch {
        // Network failure (offline PWA launch) is not proof the token is bad,
        // but without verification the app cannot know the role either. Treat
        // it as signed out; the next successful load restores the session.
        if (!cancelled) writeStoredToken(null);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      // The backend deliberately returns one message for unknown user, wrong
      // password and revoked account. Surface it as-is rather than guessing.
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message ?? "Could not sign in");
    }
    const data = await res.json();
    writeStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    writeStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ isLoaded, isSignedIn: !!user, user, token, login, logout }),
    [isLoaded, user, token, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export const useSession = useSessionContext;

// getToken stays async to match how every page already calls it.
export function useAuth() {
  const { isLoaded, isSignedIn, token, logout } = useSessionContext();
  const getToken = useCallback(async () => token, [token]);
  return { isLoaded, isSignedIn, getToken, signOut: logout };
}

export function useUser() {
  const { isLoaded, isSignedIn, user } = useSessionContext();
  return { isLoaded, isSignedIn, user };
}

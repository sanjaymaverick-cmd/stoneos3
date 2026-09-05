"use client";

import { useUser } from "./session";

// Every page used to re-read the role inline (see AppNav.tsx). Centralized
// here now that several call sites need it.
// Returns undefined while the session is still resolving — callers should
// treat that the same as "no elevated role" rather than flashing an
// owner-only view.
export function useRole(): string | undefined {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return undefined;
  return user?.role;
}

"use client";

import { useUser } from "@clerk/nextjs";

// Every page used to re-read user?.publicMetadata?.role inline (see AppNav.tsx).
// Centralized here now that a second call site (dashboard) needs it too.
// Returns undefined while Clerk is still loading — callers should treat that
// the same as "no elevated role" rather than flashing an owner-only view.
export function useRole(): string | undefined {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return undefined;
  return user?.publicMetadata?.role as string | undefined;
}

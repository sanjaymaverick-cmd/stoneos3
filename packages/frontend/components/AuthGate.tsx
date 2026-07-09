"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isPublic) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, isPublic, router]);

  if (!isPublic && (!isLoaded || !isSignedIn)) return null;
  return <>{children}</>;
}

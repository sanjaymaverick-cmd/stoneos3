"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { DEMO_MODE } from "../lib/demo";

const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  // Demo environment: no sign-in wall — render the app straight through.
  if (DEMO_MODE) return <>{children}</>;

  return <ClerkAuthGate>{children}</ClerkAuthGate>;
}

function ClerkAuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isPublic) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, isPublic, router]);

  if (!isPublic && (!isLoaded || !isSignedIn)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6B6255", fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }
  return <>{children}</>;
}

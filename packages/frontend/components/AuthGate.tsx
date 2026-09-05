"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../lib/session";
import { isPublicPath } from "../lib/routePolicy";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // Shares one definition of "pre-auth route" with RouteAccessGuard and the
  // nav, so a page can never be public to one and private to another.
  const isPublic = isPublicPath(pathname);

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

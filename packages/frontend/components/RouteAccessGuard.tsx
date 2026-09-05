"use client";

import { usePathname } from "next/navigation";
import { useUser } from "../lib/session";
import { canAccessRoute, isPublicPath } from "../lib/routePolicy";

// Authorization only. AuthGate (which wraps this) owns authentication and the
// sign-in redirect; by the time this renders a non-public route the user is
// signed in. This is UX — the backend RolesGuard is the real enforcement, so a
// user who defeats this still gets 403s from every data call.
export function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();

  if (isPublicPath(pathname)) return <>{children}</>;

  // Fail closed while the session is still resolving rather than flashing a page the
  // role may not be allowed to see.
  if (!isLoaded) {
    return (
      <div className="app-shell">
        <p className="loading-note">Checking access…</p>
      </div>
    );
  }

  // AuthGate is mid-redirect; render nothing rather than an access error.
  if (!isSignedIn) return null;

  const role = user?.role;
  if (!canAccessRoute(role, pathname)) {
    return (
      <div className="app-shell">
        <div className="ticket">
          <div className="ticket-notch left" />
          <div className="ticket-notch right" />
          <div className="ticket-header">
            <div className="ticket-icon rust">!</div>
            <div>
              <div className="ticket-title">Access restricted</div>
              <div className="ticket-subtitle">
                {role ? `Your role (${role}) does not include this workflow` : "No role has been granted to this account yet"}
              </div>
            </div>
          </div>
          <p className="loading-note">
            {role
              ? "Ask an owner or manager if you need access to this page."
              : "Ask an owner or manager to provision your account."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

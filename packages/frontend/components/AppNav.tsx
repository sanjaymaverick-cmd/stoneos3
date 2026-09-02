"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
import { navLinksFor } from "../lib/routePolicy";

export function AppNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const role = user?.publicMetadata?.role as string | undefined;
  // Single source of truth with RouteAccessGuard and the backend RolesGuard —
  // a link is only rendered if the same policy would let the role open it.
  const links = navLinksFor(role);

  return (
    <div className="nav-links">
      {links.map((l) => {
        const isActive = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link key={l.href} href={l.href} className={isActive ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
      <UserButton />
    </div>
  );
}

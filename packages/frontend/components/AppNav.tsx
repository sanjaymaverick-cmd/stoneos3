"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useRole } from "../lib/useRole";
import { DEMO_MODE } from "../lib/demo";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dpr", label: "Production" },
  { href: "/polishing", label: "Polishing" },
  { href: "/sales", label: "Sales" },
  { href: "/expenses", label: "Expenses" },
  { href: "/recovery-ratio", label: "Recovery Ratio" },
];

export function AppNav() {
  const pathname = usePathname();
  // useRole() returns "owner" in demo mode, so partners see the full nav
  // (Team + Copilot) without a Clerk session.
  const role = useRole();
  let links = role === "owner" || role === "admin" ? [...LINKS, { href: "/admin/users", label: "Team" }] : LINKS;
  // Owner only — narrower than "Team" above. The Owner's explicit choice for
  // this feature, not an oversight.
  if (role === "owner") links = [...links, { href: "/copilot", label: "Copilot" }];

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
      {DEMO_MODE ? <span className="nav-demo-badge">DEMO</span> : <UserButton />}
    </div>
  );
}

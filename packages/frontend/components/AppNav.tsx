"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";

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
  const { user } = useUser();
  const role = user?.publicMetadata?.role as string | undefined;
  let links = role === "owner" || role === "admin" ? [...LINKS, { href: "/admin/users", label: "Team" }] : LINKS;
  // Owner only — narrower than "Team" above. The Owner's explicit choice for
  // this feature, not an oversight.
  if (role === "owner") links = [...links, { href: "/copilot", label: "Copilot" }];

  return (
    <div className="nav-links">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
          {l.label}
        </Link>
      ))}
      <UserButton />
    </div>
  );
}

import { ClerkProvider } from "@clerk/nextjs";
import { AuthGate } from "../components/AuthGate";
import { RouteAccessGuard } from "../components/RouteAccessGuard";
import "./globals.css";

export const metadata = { title: "StoneOS — Vedam Granites" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><ClerkProvider><AuthGate><RouteAccessGuard>{children}</RouteAccessGuard></AuthGate></ClerkProvider></body>
    </html>
  );
}

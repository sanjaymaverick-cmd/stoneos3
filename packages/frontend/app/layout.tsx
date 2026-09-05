import type { Metadata, Viewport } from "next";
import { SessionProvider } from "../lib/session";
import { AuthGate } from "../components/AuthGate";
import { RouteAccessGuard } from "../components/RouteAccessGuard";
import { ServiceWorker } from "../components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoneOS — Vedam Granites",
  description: "Factory operations: blocks, slabs, production, sales and expenses.",
  applicationName: "StoneOS",
  appleWebApp: { capable: true, title: "StoneOS", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays ENABLED. Pinching to read a slab serial is a real need on a
  // phone in a dusty shed, and disabling it fails WCAG 1.4.4.
  maximumScale: 5,
  themeColor: "#1C1B1A",
  // The header stamp is graphite and runs to the top of the screen, so the
  // Android status bar should match it rather than sit on a pale strip.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <AuthGate>
            <RouteAccessGuard>{children}</RouteAccessGuard>
          </AuthGate>
        </SessionProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

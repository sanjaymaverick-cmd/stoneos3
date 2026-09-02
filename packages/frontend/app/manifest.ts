import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest by Next's App Router.
//
// This is what makes StoneOS installable: on Android, Chrome offers "Add to
// Home screen" and the app then launches without browser chrome, which is
// what people mean when they ask for "the app". No Play Store, no second
// codebase — the same build serves the operator's phone and the owner's
// tablet.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StoneOS — Vedam Granites",
    short_name: "StoneOS",
    description: "Factory operations: blocks, slabs, production, sales and expenses.",
    start_url: "/dashboard",
    // Operators land on the floor screens, so the app should open where work
    // happens rather than on a marketing page.
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#EDEAE4", // --stone-100, matches the page ground so the
    theme_color: "#1C1B1A", //     splash does not flash white on launch
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable icons carry a safe zone so Android can crop them to whatever
      // shape the launcher uses without clipping the artwork.
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["business", "productivity"],
  };
}

"use client";

import { useEffect } from "react";

// Registers /sw.js, which is what makes the app installable on Android.
//
// Registration is deliberately skipped in development: a cached shell during
// local work produces confusing "why isn't my change showing" bugs.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Wait for load so registration never competes with the first paint on a
    // phone over mobile data.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration costs the install prompt, not the app. Never
        // surface it to a supervisor mid-shift.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}

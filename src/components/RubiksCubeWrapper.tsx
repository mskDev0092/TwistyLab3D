"use client";

/**
 * RubiksCubeWrapper
 * =================
 * The client-side SSR boundary.
 *
 * `next/dynamic` with `{ ssr: false }` is only allowed inside a Client
 * Component ("use client") in the App Router - Server Components reject it.
 * So the architecture is:
 *
 *   app/page.tsx            (Server Component, can export metadata)
 *     └─ RubiksCubeWrapper  (THIS FILE - "use client", owns the ssr:false import)
 *          └─ RubiksCubeCanvas (browser-only Three.js code, never bundled for SSR)
 *
 * While the chunk is being fetched, `loading` renders a lightweight spinner,
 * so users never see a hydration mismatch or an empty frame.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const RubiksCubeCanvas = dynamic(() => import("@/components/RubiksCubeCanvas"), {
  ssr: false, // Three.js needs window/document -> browser only
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,#1d2233_0%,#0b0d13_58%,#05060a_100%)]"
    >
      <Loader2
        className="size-8 animate-spin text-white/70"
        aria-hidden
        strokeWidth={2.5}
      />
      <p className="text-xs font-medium tracking-wide text-white/55">
        Loading the 3D cube&hellip;
      </p>
    </div>
  ),
});

export default function RubiksCubeWrapper() {
  return <RubiksCubeCanvas />;
}

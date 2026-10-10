"use client";

/**
 * CloverPyramidWrapper
 * ====================
 * The client-side SSR boundary for the Clover Pyramid, mirroring
 * {@link RubiksCubeWrapper}: `next/dynamic` with `{ ssr: false }` is only valid
 * inside a Client Component, so this file owns the browser-only Three.js import
 * while `app/clover-pyramid/page.tsx` stays a Server Component.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const CloverPyramidCanvas = dynamic(
  () => import("@/components/CloverPyramidCanvas"),
  {
    ssr: false, // Three.js needs window/document -> browser only
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,#241a2e_0%,#120f1c_58%,#06050a_100%)]"
      >
        <Loader2
          className="size-8 animate-spin text-white/70"
          aria-hidden
          strokeWidth={2.5}
        />
        <p className="text-xs font-medium tracking-wide text-white/55">
          Loading the jumbling pyramid&hellip;
        </p>
      </div>
    ),
  },
);

export default function CloverPyramidWrapper() {
  return <CloverPyramidCanvas />;
}

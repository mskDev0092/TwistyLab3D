"use client";

/**
 * ImagePuzzleWrapper
 * ==================
 * Client-side SSR boundary for the "Photo Jigsaw", mirroring the other games:
 * `next/dynamic` with `{ ssr: false }` is only valid inside a Client Component,
 * so this file owns the browser-only Three.js import while
 * `app/image-puzzle/page.tsx` stays a Server Component.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ImagePuzzleCanvas = dynamic(
  () => import("@/components/ImagePuzzleCanvas"),
  {
    ssr: false, // Three.js needs window/document -> browser only
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,#1e2233_0%,#0d1019_58%,#05060a_100%)]"
      >
        <Loader2
          className="size-8 animate-spin text-white/70"
          aria-hidden
          strokeWidth={2.5}
        />
        <p className="text-xs font-medium tracking-wide text-white/55">
          Loading the photo jigsaw&hellip;
        </p>
      </div>
    ),
  },
);

export default function ImagePuzzleWrapper() {
  return <ImagePuzzleCanvas />;
}

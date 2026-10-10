"use client";

/**
 * HomeCubeWrapper
 * ===============
 * Client-side SSR boundary for the inside-the-cube homepage. `next/dynamic`
 * with `{ ssr: false }` must live in a Client Component, so the Server
 * Component page imports this wrapper, which lazily loads the browser-only
 * Three.js scene. A lightweight loader shows while the chunk loads.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const HomeCube = dynamic(() => import("@/components/HomeCube"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="grid h-dvh w-full place-items-center bg-[#05060c]"
    >
      <div className="flex flex-col items-center gap-3 text-white/70">
        <Loader2 className="size-7 animate-spin" aria-hidden />
        <p className="text-xs font-medium tracking-wide">Stepping inside&hellip;</p>
      </div>
    </div>
  ),
});

export default function HomeCubeWrapper() {
  return <HomeCube />;
}

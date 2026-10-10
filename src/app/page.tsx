import type { Metadata } from "next";

import RubiksCubeWrapper from "@/components/RubiksCubeWrapper";

export const metadata: Metadata = {
  title: "Rubik's Cube · Vanilla Three.js + Next.js",
  description:
    "A fully interactive, 3D, multicolor Rubik's Cube puzzle built with vanilla Three.js, OrbitControls, Raycaster face dragging and a strictly static Next.js App Router setup.",
  keywords: [
    "Rubik's Cube",
    "Three.js",
    "Next.js",
    "TypeScript",
    "WebGL",
    "puzzle",
  ],
};

/**
 * Server Component: renders the shell and delegates ALL browser-only work to
 * the client wrapper, which pulls in the Three.js canvas with ssr: false.
 */
export default function HomePage() {
  return (
    <main>
      <RubiksCubeWrapper />
    </main>
  );
}

import type { Metadata } from "next";

import CloverPyramidWrapper from "@/components/CloverPyramidWrapper";

export const metadata: Metadata = {
  title: "Clover Pyramid · Jumbling 3D puzzle (vanilla Three.js)",
  description:
    "An expert jumbling puzzle: a regular tetrahedron cut by four overlapping circular clover disks. Twist corners in 60° detents — the odd steps are non-obvious jumbling moves that leave pieces tilted and shared edges in play. Vanilla Three.js, static export, mouse + touch.",
  keywords: [
    "jumbling puzzle",
    "Clover Icosahedron",
    "Jumbling Pyramids",
    "tetrahedron",
    "Three.js",
    "WebGL",
    "twisty puzzle",
    "expert puzzle",
  ],
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Clover Pyramid — Jumbling 3D Puzzle",
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires WebGL",
  description:
    "Expert jumbling puzzle: a tetrahedron cut by four overlapping circular clover disks with 60° detents, including non-obvious jumbling rotations and shared edge pieces. Interactive 3D with vanilla Three.js.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
};

/**
 * Server Component: renders the shell + structured data and delegates all
 * browser-only Three.js work to the client wrapper (ssr: false).
 */
export default function CloverPyramidPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CloverPyramidWrapper />
    </main>
  );
}

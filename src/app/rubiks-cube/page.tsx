import type { Metadata } from "next";

import RubiksCubeWrapper from "@/components/RubiksCubeWrapper";

export const metadata: Metadata = {
  title: "Rubik's Cube · AI-playable 3D puzzle (vanilla Three.js)",
  description:
    "A fully interactive 3D Rubik's Cube that any AI or bot can play: copy the live cube state + play protocol, paste moves in standard Singmaster notation and watch them execute, or drive it programmatically via window.RubiksCubeAPI, #state= URLs, /llms.txt and /robots.txt. Vanilla Three.js, static export, no login, open to all.",
  keywords: [
    "Rubik's Cube",
    "Three.js",
    "Next.js",
    "TypeScript",
    "WebGL",
    "puzzle",
    "AI playable",
    "Kociemba facelets",
    "Singmaster notation",
  ],
  // Open to every bot, crawler and AI agent on the web.
  robots: { index: true, follow: true },
};

/** Structured data so bots understand what this page is at a glance. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "AI-playable 3D Rubik's Cube",
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires WebGL",
  description:
    "Interactive 3D Rubik's Cube (vanilla Three.js) with an open remote-play protocol: any AI, bot or solver can read the live Kociemba facelet state, reply with Singmaster moves, and watch them executed — via the on-page AI panel, window.RubiksCubeAPI, or #state= deep links.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
};

/**
 * Server Component: renders the shell and delegates ALL browser-only work to
 * the client wrapper, which pulls in the Three.js canvas with ssr: false.
 */
export default function RubiksCubePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RubiksCubeWrapper />
    </main>
  );
}

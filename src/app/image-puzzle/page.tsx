import type { Metadata } from "next";

import ImagePuzzleWrapper from "@/components/ImagePuzzleWrapper";

export const metadata: Metadata = {
  title: "Photo Jigsaw · Image swap puzzle (vanilla Three.js)",
  description:
    "Turn any picture into a 3D jigsaw: choose a built-in sample or upload / drop your own image, scramble it into tiles on a 3D board, then drag the tiles back into place to rebuild the picture. Vanilla Three.js, static export, mouse + touch.",
  keywords: [
    "photo puzzle",
    "jigsaw",
    "sliding tiles",
    "image puzzle",
    "Three.js",
    "WebGL",
    "browser puzzle",
    "upload image puzzle",
  ],
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Photo Jigsaw — 3D Picture Puzzle",
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires WebGL",
  description:
    "Turn any picture into a scrambled 3D jigsaw. Choose a built-in sample or upload your own image, then drag the scrambled tiles back into place to rebuild the original picture.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
};

/**
 * Server Component: renders the shell + structured data and delegates all
 * browser-only Three.js work to the client wrapper (ssr: false).
 */
export default function ImagePuzzlePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ImagePuzzleWrapper />
    </main>
  );
}

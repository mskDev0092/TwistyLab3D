import type { Metadata } from "next";
import HomeCubeWrapper from "@/components/HomeCubeWrapper";

export const metadata: Metadata = {
  title: "Twisty Lab · step inside the 3D puzzle cube",
  description:
    "Stand inside an interactive 3D cube and look around in 360° to pick your puzzle: the classic Rubik's Cube, the expert Clover Pyramid, and the Photo Jigsaw. Six walls, fifty-four tiles, built with vanilla Three.js. No login, open to all.",
  keywords: [
    "twisty puzzles",
    "Rubik's Cube",
    "Clover Pyramid",
    "Photo Jigsaw",
    "Three.js",
    "WebGL",
    "3D puzzles",
    "interactive homepage",
  ],
  robots: { index: true, follow: true },
};

/** Structured data so crawlers understand the studio at a glance. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Twisty Lab",
  description:
    "An interactive vanilla Three.js puzzle studio: an inside-the-cube 3D menu leading to the Rubik's Cube, the Clover Pyramid and the Photo Jigsaw.",
  inLanguage: "en",
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeCubeWrapper />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Box, Pyramid, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Twisty Lab · 3D twisty puzzle studio",
  description:
    "Play interactive vanilla Three.js twisty puzzles in your browser — the classic Rubik's Cube and the expert Clover Pyramid jumbling tetrahedron. No login, WebGL, mouse and touch, open to all.",
  keywords: [
    "twisty puzzles",
    "Rubik's Cube",
    "Clover Pyramid",
    "jumbling puzzle",
    "Three.js",
    "WebGL",
    "3D puzzles",
  ],
  robots: { index: true, follow: true },
};

type Game = {
  href: string;
  name: string;
  tagline: string;
  blurb: string;
  level: string;
  Icon: typeof Box;
  accent: string;
  ring: string;
  chip: string;
};

const games: Game[] = [
  {
    href: "/rubiks-cube",
    name: "Rubik's Cube",
    tagline: "Classic 3×3×3",
    blurb:
      "The timeless face-turning cube — drag a face to twist it, scramble, and solve. Fully AI-playable via standard Singmaster notation.",
    level: "Casual",
    Icon: Box,
    accent: "from-sky-500 to-indigo-500",
    ring: "group-hover:ring-sky-400/50",
    chip: "bg-sky-500/15 text-sky-300",
  },
  {
    href: "/clover-pyramid",
    name: "Clover Pyramid",
    tagline: "Expert jumbling tetrahedron",
    blurb:
      "A tetrahedron cut by four overlapping clover disks. Odd 60° turns are non-obvious jumbling moves that shuffle shared edge pieces between corners.",
    level: "Expert",
    Icon: Pyramid,
    accent: "from-fuchsia-500 to-violet-600",
    ring: "group-hover:ring-fuchsia-400/50",
    chip: "bg-fuchsia-500/15 text-fuchsia-300",
  },
];

export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,#1e2a4a_0%,transparent_55%),radial-gradient(circle_at_85%_15%,#3a1d4a_0%,transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-14 sm:py-20">
        {/* Masthead */}
        <header className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.28em] text-white/60 backdrop-blur">
            <Sparkles className="size-3.5 text-sky-300" /> 3D puzzle studio
          </span>
          <h1 className="mt-6 bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl">
            Twisty Lab
          </h1>
          <p className="mt-4 max-w-xl text-balance text-sm leading-relaxed text-white/60 sm:text-base">
            Interactive twisty puzzles built with vanilla Three.js. Pick a
            challenge — each runs entirely in your browser, on mouse or touch.
          </p>
        </header>

        {/* Game cards */}
        <div className="mt-12 grid gap-5 sm:grid-cols-2 sm:mt-14">
          {games.map((game) => (
            <Link
              key={game.href}
              href={game.href}
              className={`group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-6 ring-1 ring-transparent transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.07] hover:shadow-2xl hover:shadow-black/40 ${game.ring}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`grid size-12 place-items-center rounded-xl bg-gradient-to-br ${game.accent} shadow-lg`}
                >
                  <game.Icon className="size-6 text-white" />
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${game.chip}`}
                >
                  {game.level}
                </span>
              </div>

              <h2 className="mt-5 text-xl font-semibold tracking-tight">
                {game.name}
              </h2>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-white/40">
                {game.tagline}
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-white/60">
                {game.blurb}
              </p>

              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition-colors group-hover:text-white">
                Play
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>

        <footer className="mt-auto pt-14 text-center text-[11px] text-white/35">
          Built with vanilla Three.js · static export · no login
        </footer>
      </div>
    </main>
  );
}

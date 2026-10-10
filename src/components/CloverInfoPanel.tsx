"use client";

/**
 * CloverInfoPanel
 * ===============
 * The side column for the Clover Pyramid: difficulty, the jumbling mechanic
 * explained in plain language, the colour legend, controls and a live turn log.
 * It mirrors the studio layout used by the Rubik's Cube page (cube/renderer on
 * one side, context panel on the other) so both games feel like one app.
 */

import { CircleDot, Info, Layers3, MousePointer2, Sparkles } from "lucide-react";

import { FACE_COLORS, FACE_COLOR_NAMES } from "@/lib/cloverPyramid";

interface CloverInfoPanelProps {
  moveCount: number;
  isSolved: boolean;
  busy: boolean;
  history: string[];
}

export default function CloverInfoPanel({
  moveCount,
  isSolved,
  busy,
  history,
}: CloverInfoPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      {/* ------------------------------ header ------------------------------ */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2">
            <Layers3 className="size-5 text-fuchsia-300" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-white">
              Jumbling Pyramids
              <span className="ml-1.5 font-normal text-white/40">
                — irregular cuts
              </span>
            </h2>
            <p className="text-[11px] leading-snug text-white/45">
              Overlapping corner disks · non-obvious 60° rotations
            </p>
          </div>
        </div>
        <span
          aria-live="polite"
          className="shrink-0 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/55"
        >
          {busy ? "turning…" : isSolved ? "solved" : "scrambled"}
        </span>
      </div>

      {/* --------------------------- the mechanic --------------------------- */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/90">
          <Sparkles className="size-3.5 text-fuchsia-300" aria-hidden />
          What makes it jumble
        </h3>
        <ul className="space-y-2 text-[11px] leading-relaxed text-white/60">
          <li>
            Each corner of the pyramid carries a circular{" "}
            <span className="font-medium text-white/85">clover disk</span>. The
            cut is round, not straight — so the four disks{" "}
            <span className="font-medium text-white/85">overlap</span> along the
            edges.
          </li>
          <li>
            The 12{" "}
            <span className="font-medium text-white/85">white edge pieces</span>{" "}
            sit in the overlap and answer to{" "}
            <span className="font-medium text-white/85">two corners at once</span>
            . Twist one corner and a shared piece can slide out from under a
            neighbour — that is the jumbling.
          </li>
          <li>
            Disks turn in 60° detents. Even steps (120°) are the clean, obvious
            turns;{" "}
            <span className="font-medium text-white/85">odd 60° steps</span>{" "}
            leave petals tilted mid-face and scramble the whole thing in ways
            that are hard to predict.
          </li>
        </ul>
      </div>

      {/* ----------------------------- controls ----------------------------- */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/90">
          <MousePointer2 className="size-3.5 text-sky-300" aria-hidden />
          Controls
        </h3>
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-white/60">
          <li>
            <span className="font-medium text-white/85">Drag near a corner</span>{" "}
            — twist that clover disk. Release to snap to the nearest 60°.
          </li>
          <li>
            <span className="font-medium text-white/85">Drag empty space</span> —
            orbit the camera. Use <span className="font-medium text-white/85">scroll / pinch</span> to
            zoom.
          </li>
          <li>
            <span className="font-medium text-white/85">Scramble</span> deals a
            random mix of clean and jumbling turns;{" "}
            <span className="font-medium text-white/85">Reset</span> returns the
            solved state.
          </li>
        </ul>
      </div>

      {/* ------------------------------ legend ------------------------------ */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-white/90">
          <Info className="size-3.5 text-amber-300" aria-hidden />
          Legend
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {FACE_COLORS.map((color, index) => (
            <div
              key={color}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/25 px-2.5 py-2"
            >
              <span
                className="size-3.5 shrink-0 rounded-full ring-1 ring-black/40"
                style={{ backgroundColor: `#${color.toString(16).padStart(6, "0")}` }}
              />
              <span className="text-[11px] font-medium text-white/75">
                {FACE_COLOR_NAMES[index]} face
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/25 px-2.5 py-2">
            <span className="size-3.5 shrink-0 rounded-full bg-[#e4e9f2] ring-1 ring-black/40" />
            <span className="text-[11px] font-medium text-white/75">
              Shared edge
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/25 px-2.5 py-2">
            <CircleDot className="size-3.5 shrink-0 text-white/45" aria-hidden />
            <span className="text-[11px] font-medium text-white/75">
              Fixed centre
            </span>
          </div>
        </div>
      </div>

      {/* ---------------------------- turn log ------------------------------ */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-white/90">Turn log</h3>
          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white/55">
            {moveCount} turn{moveCount === 1 ? "" : "s"}
          </span>
        </div>
        {history.length === 0 ? (
          <p className="text-[11px] text-white/40">
            No turns yet. Scramble, or start twisting a clover disk.
          </p>
        ) : (
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {history
              .slice()
              .reverse()
              .map((token, index) => (
                <span
                  key={`${token}-${index}`}
                  className="rounded-md border border-white/5 bg-black/30 px-2 py-1 font-mono text-[10px] text-white/60"
                >
                  {token}
                </span>
              ))}
          </div>
        )}
      </div>

      <p className="mt-auto pt-1 text-center text-[10px] text-white/30">
        Vanilla Three.js · regular tetrahedron · jumbling group
      </p>
    </div>
  );
}

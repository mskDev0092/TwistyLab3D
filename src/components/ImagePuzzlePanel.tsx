"use client";

/**
 * ImagePuzzlePanel
 * ================
 * Left studio panel for the "Photo Jigsaw" puzzle, matching the layout language
 * of the Rubik's Cube and Clover Pyramid panels: choose an image (samples or
 * upload), pick a difficulty, watch a live reference preview + progress, and
 * shuffle / reset the board.
 */

import { useMemo, useRef } from "react";
import {
  Check,
  Image as ImageIcon,
  MousePointer2,
  RotateCcw,
  Shuffle,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DIFFICULTIES,
  SAMPLES,
  renderSample,
  type SampleId,
} from "@/lib/imagePuzzle";

interface ImagePuzzlePanelProps {
  moveCount: number;
  placed: number;
  total: number;
  solved: boolean;
  cols: number;
  rows: number;
  previewUrl: string | null;
  activeSample: SampleId | null;
  uploading: boolean;
  onSelectSample: (id: SampleId) => void;
  onUpload: (file: File) => void;
  onSelectGrid: (cols: number, rows: number) => void;
  onShuffle: () => void;
  onReset: () => void;
}

export default function ImagePuzzlePanel({
  moveCount,
  placed,
  total,
  solved,
  cols,
  rows,
  previewUrl,
  activeSample,
  uploading,
  onSelectSample,
  onUpload,
  onSelectGrid,
  onShuffle,
  onReset,
}: ImagePuzzlePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Thumbnails are deterministic, so render them once.
  const sampleThumbs = useMemo(
    () =>
      SAMPLES.map((sample) => ({
        ...sample,
        thumb: renderSample(sample.id, 128).toDataURL("image/png"),
      })),
    [],
  );

  const progress = total > 0 ? Math.round((placed / total) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      {/* ------------------------------- header ------------------------------- */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 shadow-lg">
            <ImageIcon className="size-4.5 text-white" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight text-white">
              Photo Jigsaw
              <span className="ml-1.5 font-normal text-white/40">
                — swap the tiles back
              </span>
            </h1>
            <p className="text-[11px] leading-snug text-white/45">
              Pick a picture · drag tiles to rebuild it
            </p>
          </div>
        </div>
        <span
          aria-live="polite"
          className="shrink-0 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/55"
        >
          {solved ? "solved" : `${placed}/${total}`} · swaps: {moveCount}
        </span>
      </div>

      {/* ----------------------------- how to play ---------------------------- */}
      <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-[11px] leading-relaxed text-white/60">
        <MousePointer2 className="mt-0.5 size-3.5 shrink-0 text-white/40" aria-hidden />
        <p>
          <span className="text-white/80">Drag</span> a tile onto another to swap
          them — or <span className="text-white/80">tap</span> two tiles to swap.
          Drag the background to orbit the board.
        </p>
      </div>

      {/* ------------------------------- image -------------------------------- */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-tight text-white/85">
            Choose a picture
          </h2>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/20"
          >
            <Upload className="size-3.5" />
            {uploading ? "Loading…" : "Upload"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {sampleThumbs.map((sample) => {
            const active = activeSample === sample.id;
            return (
              <button
                key={sample.id}
                type="button"
                onClick={() => onSelectSample(sample.id)}
                className={`group relative aspect-square overflow-hidden rounded-lg border ring-2 transition-all ${
                  active
                    ? "border-white/40 ring-sky-400"
                    : "border-white/10 ring-transparent hover:ring-white/25"
                }`}
                title={sample.name}
              >
                <img
                  src={sample.thumb}
                  alt={sample.name}
                  className="size-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white/90">
                  {sample.name}
                </span>
                {active && (
                  <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-sky-500">
                    <Check className="size-2.5 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          Tip: you can also drop an image file anywhere on the board.
        </p>
      </section>

      {/* ----------------------------- difficulty ----------------------------- */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <h2 className="mb-2.5 text-xs font-semibold tracking-tight text-white/85">
          Difficulty
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {DIFFICULTIES.map((preset) => {
            const active = preset.cols === cols && preset.rows === rows;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onSelectGrid(preset.cols, preset.rows)}
                className={`flex flex-col items-center rounded-lg border px-1 py-2 transition-all ${
                  active
                    ? "border-sky-400/60 bg-sky-500/15 text-white"
                    : "border-white/10 bg-black/20 text-white/60 hover:bg-white/10 hover:text-white/85"
                }`}
              >
                <span className="text-xs font-semibold">{preset.label}</span>
                <span className="text-[9px] uppercase tracking-wide opacity-70">
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------- reference ------------------------------- */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-white/85">
            <Sparkles className="size-3.5 text-amber-300" /> Reference
          </h2>
          <span className="text-[10px] text-white/45">the finished picture</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Original picture"
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center text-white/30">
                <ImageIcon className="size-5" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11px] text-white/55">
              <span>Progress</span>
              <span className="font-medium text-white/80">{progress}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-fuchsia-500 transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-white/55">
              {solved ? (
                <>
                  <Sparkles className="size-3.5 text-emerald-400" /> Puzzle solved!
                </>
              ) : (
                <>
                  <span className="font-semibold text-white/80">{placed}</span> of{" "}
                  {total} tiles in place
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------- actions ------------------------------ */}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onShuffle}
          className="h-10 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          <Shuffle className="size-4" /> Shuffle
        </Button>
        <Button
          type="button"
          onClick={onReset}
          className="h-10 bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white hover:opacity-90"
        >
          <RotateCcw className="size-4" /> Reset
        </Button>
      </div>
    </div>
  );
}

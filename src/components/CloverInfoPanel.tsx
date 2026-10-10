"use client";

/**
 * CloverInfoPanel
 * ===============
 * The side column for the Clover Pyramid. It leads with the AI remote-play
 * bridge (copy prompt + state, paste a reply, run it live) and then explains
 * the jumbling mechanic, controls, colour legend and a turn log. It mirrors
 * the studio layout of the Rubik's Cube page so both games feel like one app.
 */

import { useMemo, useState } from "react";
import {
  Bot,
  Braces,
  Check,
  CircleDot,
  ClipboardCopy,
  Info,
  Layers3,
  Loader2,
  MousePointer2,
  Play,
  Sparkles,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FACE_COLORS, FACE_COLOR_NAMES, type CloverMove } from "@/lib/cloverPyramid";
import {
  buildCloverAiPrompt,
  extractCloverPrediction,
  isCloverStateCode,
  parseCloverMoveSequence,
} from "@/lib/cloverNotation";

interface CloverInfoPanelProps {
  moveCount: number;
  isSolved: boolean;
  busy: boolean;
  history: string[];
  /** Live 18-char slot code ("" until the 3D scene boots). */
  stateCode: string;
  runProgress: { current: number; total: number; token: string } | null;
  verify: { match: boolean } | null;
  onRunMoves: (moves: CloverMove[], predictedState?: string) => void;
}

/** Clipboard write with a legacy fallback for non-secure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const scratch = document.createElement("textarea");
      scratch.value = text;
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.appendChild(scratch);
      scratch.select();
      const ok = document.execCommand("copy");
      scratch.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function CloverInfoPanel({
  moveCount,
  isSolved,
  busy,
  history,
  stateCode,
  runProgress,
  verify,
  onRunMoves,
}: CloverInfoPanelProps) {
  const [pasteText, setPasteText] = useState("");

  const stateReady = isCloverStateCode(stateCode);
  const prompt = useMemo(
    () =>
      stateReady
        ? buildCloverAiPrompt({ stateCode, moveCount, isSolved, history })
        : "Waiting for the 3D pyramid to initialize...",
    [stateReady, stateCode, moveCount, isSolved, history],
  );

  const parsed = useMemo(() => parseCloverMoveSequence(pasteText), [pasteText]);
  const predictedState = useMemo(() => extractCloverPrediction(pasteText), [pasteText]);
  const tooManyMoves = parsed.moves.length > 150;
  const runnableMoves = tooManyMoves ? [] : parsed.moves;

  const handleCopy = async (text: string, label: string): Promise<void> => {
    const ok = await copyText(text);
    if (ok) {
      toast.success(`${label} copied`, {
        description: "Paste it into any AI chat or agent.",
      });
    } else {
      toast.error("Copy failed", {
        description: "Select the text manually and copy with Ctrl/Cmd+C.",
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      {/* ------------------------------ header ------------------------------ */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2">
            <Bot className="size-5 text-fuchsia-300" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-white">
              AI Play
              <span className="ml-1.5 font-normal text-white/40">
                — any AI can solve it
              </span>
            </h2>
            <p className="text-[11px] leading-snug text-white/45">
              Copy prompt · paste reply · watch it run
            </p>
          </div>
        </div>
        <span
          aria-live="polite"
          className="shrink-0 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/55"
        >
          Turns: {moveCount} · {busy ? "turning…" : isSolved ? "solved" : "scrambled"}
        </span>
      </div>

      {/* --------------------------- step 1 · copy --------------------------- */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 className="text-xs font-semibold text-white/90">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">
              1
            </span>
            Copy prompt + state{" "}
            <span className="font-normal text-white/40">(state at the END)</span>
          </h3>
          {predictedState && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              STATE_AFTER detected in reply
            </span>
          )}
        </div>

        <Textarea
          readOnly
          aria-label="AI prompt with the current Clover Pyramid state at the end"
          onFocus={(event) => event.currentTarget.select()}
          value={prompt}
          rows={7}
          className="max-h-40 min-h-24 resize-y bg-black/40 font-mono text-[10px] leading-relaxed text-white/85"
        />

        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!stateReady}
            onClick={() => void handleCopy(prompt, "Full AI prompt")}
            className="h-8 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
          >
            <ClipboardCopy className="size-3.5" aria-hidden /> Copy full prompt
          </Button>
          <Button
            size="sm"
            disabled={!stateReady}
            onClick={() => void handleCopy(stateCode, "State code")}
            className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            variant="outline"
          >
            <Braces className="size-3.5" aria-hidden /> Copy state only
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          The prompt ends with the live 18-character slot code, so the AI reasons
          from the exact same position you see.
        </p>
      </div>

      {/* -------------------------- step 2 · paste -------------------------- */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="mb-2 text-xs font-semibold text-white/90">
          <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">
            2
          </span>
          Paste the AI reply &amp; run it
        </h3>

        <Textarea
          aria-label="Paste AI reply with Clover Pyramid moves here"
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={"e.g.\nMOVES: A B' C2 A' D3'\nSTATE_AFTER: 000111222333eeeeee"}
          rows={3}
          className="min-h-20 resize-y bg-black/40 font-mono text-[11px] leading-relaxed text-white/90 placeholder:text-white/25"
        />

        {/* Parse feedback */}
        <div className="mt-2 space-y-1.5" aria-live="polite">
          {pasteText.trim().length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {parsed.moves.length > 0 ? (
                <span className="flex items-center gap-1.5 font-medium text-emerald-300">
                  <Check className="size-3.5" aria-hidden />
                  {parsed.moves.length} turn{parsed.moves.length === 1 ? "" : "s"} parsed
                  <span className="font-normal text-white/40">
                    ({parsed.moves.reduce((sum, m) => sum + Math.abs(m.steps), 0)} detents)
                  </span>
                </span>
              ) : (
                <span className="font-medium text-amber-300">
                  No valid turns found — use corner disks A, B, C, D.
                </span>
              )}
              {parsed.ignored.length > 0 && (
                <span className="flex items-center gap-1.5 text-amber-300/80">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  Ignored: {parsed.ignored.join(", ")}
                </span>
              )}
              {tooManyMoves && (
                <span className="text-amber-300">
                  More than 150 turns parsed — that looks wrong, check the paste.
                </span>
              )}
            </div>
          )}

          {parsed.moves.length > 0 && parsed.moves.length <= 40 && (
            <p className="max-h-16 overflow-y-auto rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-white/55">
              {parsed.tokens.join(" ")}
            </p>
          )}

          {runProgress && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Executing {runProgress.token} — {runProgress.current}/{runProgress.total}
            </p>
          )}

          {verify && (
            <p
              className={`flex items-center gap-1.5 text-[11px] font-medium ${
                verify.match ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {verify.match ? (
                <>
                  <Check className="size-3.5" aria-hidden />
                  STATE_AFTER matched the real pyramid — prediction correct.
                </>
              ) : (
                <>
                  <TriangleAlert className="size-3.5" aria-hidden />
                  STATE_AFTER differed from the real result.
                </>
              )}
            </p>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy || runnableMoves.length === 0}
            onClick={() => onRunMoves(runnableMoves, predictedState)}
            className="h-8 min-w-36 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Running…
              </>
            ) : (
              <>
                <Play className="size-3.5" aria-hidden /> Run {runnableMoves.length} turn
                {runnableMoves.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
          {pasteText.trim().length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPasteText("")}
              disabled={busy}
              className="h-8 text-white/60 hover:bg-white/10 hover:text-white"
            >
              Clear
            </Button>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          Watch every 60° turn live on the pyramid. The counter uses detents
          (X2 = 2), same as manual dragging.
        </p>
      </div>

      {/* ----------------------- bot / agent access ----------------------- */}
      <details className="group rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
        <summary className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-white/80">
          <Terminal className="size-4 text-sky-300" aria-hidden />
          Bot &amp; agent access — open to everything on the web
        </summary>
        <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-white/55">
          <li>
            <span className="font-mono text-[10px] text-white/75">window.CloverPyramidAPI</span>{" "}
            — drive the pyramid from any console or script:{" "}
            <span className="font-mono text-[10px] text-white/75">
              getState() · isSolved() · getMoves() · scramble() · reset() ·
              applyMoves(&quot;A B&apos; C2&quot;) · help()
            </span>
          </li>
          <li>
            No login, no API key, no rate limit — the full play protocol travels
            inside the copied prompt, so any LLM, solver or agent can join.
          </li>
        </ul>
      </details>

      {/* ---------------------------- the mechanic --------------------------- */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/90">
          <Sparkles className="size-3.5 text-fuchsia-300" aria-hidden />
          What makes it jumble
        </h3>
        <ul className="space-y-2 text-[11px] leading-relaxed text-white/60">
          <li>
            Each corner of the pyramid carries a circular{" "}
            <span className="font-medium text-white/85">clover disk</span>. The
            cut is round, not straight — so neighbouring disks{" "}
            <span className="font-medium text-white/85">share</span> the white
            pieces that sit on each edge.
          </li>
          <li>
            The 6{" "}
            <span className="font-medium text-white/85">white edge pieces</span>{" "}
            sit in the overlap and answer to{" "}
            <span className="font-medium text-white/85">two corners at once</span>
            . Twist one corner and a shared piece can slide out from under a
            neighbour — that is the jumbling.
          </li>
          <li>
            Disks turn in 60° detents. Even steps (120°) are the clean turns;{" "}
            <span className="font-medium text-white/85">odd 60° steps</span> swap
            petals with the shared edges, so pieces travel between corners in ways
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
            orbit the camera. <span className="font-medium text-white/85">Scroll / pinch</span> to
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
          <h3 className="flex items-center gap-2 text-xs font-semibold text-white/90">
            <Layers3 className="size-3.5 text-white/50" aria-hidden /> Turn log
          </h3>
          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white/55">
            {moveCount} turn{moveCount === 1 ? "" : "s"}
          </span>
        </div>
        {history.length === 0 ? (
          <p className="text-[11px] text-white/40">
            No turns yet. Scramble, run an AI reply, or start twisting a disk.
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
        Vanilla Three.js · regular tetrahedron · open protocol for every bot
      </p>
    </div>
  );
}

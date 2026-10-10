"use client";

/**
 * AiPlayPanel
 * ===========
 * The "let any AI play" bridge, rendered as a section BELOW the cube.
 *
 * Step 1 - COPY: a self-contained prompt (move notation + color legend +
 *          current facelet state + task contract) that can be pasted into
 *          any LLM chat. The facelet string also works in dedicated solvers
 *          (e.g. kociemba-based web solvers).
 * Step 2 - PASTE: the AI's reply goes into the second box. It is parsed live
 *          (prose ignored, only valid face-turn tokens extracted) and can be
 *          executed on the real cube with one click. The move counter updates
 *          with every executed quarter turn.
 *
 * The state shown here refreshes after EVERY committed move (drag, scramble,
 * reset or pasted run), so always copy right before asking the AI.
 */

import { useMemo, useState } from "react";
import { Bot, Braces, Check, ClipboardCopy, Loader2, Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAiPrompt,
  isFaceletString,
  parseMoveSequence,
  type ParsedMove,
} from "@/lib/cubeNotation";

interface AiPlayPanelProps {
  /** Live 54-char facelet state ("" while the 3D scene boots). */
  facelets: string;
  moveCount: number;
  isSolved: boolean;
  busy: boolean;
  /** Progress of the running pasted-move sequence. */
  runProgress: { current: number; total: number } | null;
  /** Execute parsed moves on the cube (parent owns the animation queue). */
  onRunMoves: (moves: ParsedMove[]) => void;
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

export default function AiPlayPanel({
  facelets,
  moveCount,
  isSolved,
  busy,
  runProgress,
  onRunMoves,
}: AiPlayPanelProps) {
  const [pasteText, setPasteText] = useState("");

  const stateReady = isFaceletString(facelets);
  const prompt = useMemo(
    () =>
      stateReady
        ? buildAiPrompt({ facelets, moveCount, isSolved })
        : "Waiting for the 3D cube to initialize...",
    [stateReady, facelets, moveCount, isSolved],
  );

  const { moves, ignored } = useMemo(() => parseMoveSequence(pasteText), [pasteText]);
  const tooManyMoves = moves.length > 150;
  const runnableMoves = tooManyMoves ? [] : moves;

  const handleCopy = async (text: string, label: string): Promise<void> => {
    const ok = await copyText(text);
    if (ok) {
      toast.success(`${label} copied`, {
        description: "Paste it into any AI chat or solver.",
      });
    } else {
      toast.error("Copy failed", {
        description: "Select the text manually and copy with Ctrl/Cmd+C.",
      });
    }
  };

  return (
    <section
      id="ai-panel"
      aria-label="AI play: copy cube state and run pasted moves"
      className="mx-auto w-full max-w-5xl scroll-mt-4 px-4 py-10 sm:px-6 sm:py-14"
    >
      {/* Section header */}
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <Bot className="size-5 text-white/80" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            AI Play <span className="text-sm font-normal text-white/40">— let any AI solve it</span>
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/55 sm:text-sm">
            Copy the prompt below into ChatGPT, Claude, Gemini or any cube solver.
            When the answer comes back, paste it in step 2 and the cube will
            perform the moves. The state here updates live after every move.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Step 1 — copy */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-white/90">
              <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">1</span>
              Copy state + instructions
            </h3>
            <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/50">
              Moves: {moveCount} · {isSolved ? "solved" : "scrambled"}
            </span>
          </div>

          <Textarea
            readOnly
            aria-label="AI prompt with the current cube state"
            onFocus={(event) => event.currentTarget.select()}
            value={prompt}
            rows={14}
            className="max-h-72 overflow-y-auto resize-y bg-black/40 font-mono text-[11px] leading-relaxed text-white/85"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!stateReady}
              onClick={() => void handleCopy(prompt, "Full AI prompt")}
              className="h-9 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              variant="outline"
            >
              <ClipboardCopy className="size-4" aria-hidden /> Copy full prompt
            </Button>
            <Button
              size="sm"
              disabled={!stateReady}
              onClick={() => void handleCopy(facelets, "Facelet string")}
              className="h-9 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              variant="outline"
            >
              <Braces className="size-4" aria-hidden /> Copy state only
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            The 54-char state string is standard Kociemba notation (order U R F D L B),
            so dedicated solvers accept it too.
          </p>
        </div>

        {/* Step 2 — paste & run */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-white/90">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold">2</span>
            Paste the AI reply &amp; run it
          </h3>

          <Textarea
            aria-label="Paste AI reply with cube moves here"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder={"Paste the AI response here, e.g.\nR U R' U' F2 D L' B2"}
            rows={8}
            className="min-h-28 resize-y bg-black/40 font-mono text-[12px] leading-relaxed text-white/90 placeholder:text-white/25"
          />

          {/* Parse feedback */}
          <div className="mt-3 space-y-2" aria-live="polite">
            {pasteText.trim().length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {moves.length > 0 ? (
                  <span className="flex items-center gap-1.5 font-medium text-emerald-300">
                    <Check className="size-3.5" aria-hidden />
                    {moves.length} move{moves.length === 1 ? "" : "s"} parsed
                    <span className="font-normal text-white/40">
                      ({moves.reduce((sum, move) => sum + Math.abs(move.quarterTurns), 0)} quarter turns)
                    </span>
                  </span>
                ) : (
                  <span className="font-medium text-amber-300">
                    No valid moves found — use face turns like R, U&apos;, F2.
                  </span>
                )}
                {ignored.length > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-300/80">
                    <TriangleAlert className="size-3.5" aria-hidden />
                    Ignored: {ignored.join(", ")}
                  </span>
                )}
                {tooManyMoves && (
                  <span className="text-amber-300">
                    More than 150 moves parsed — that looks wrong, check the paste.
                  </span>
                )}
              </div>
            )}

            {moves.length > 0 && moves.length <= 40 && (
              <p className="max-h-20 overflow-y-auto rounded-lg border border-white/5 bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/60">
                {moves
                  .map((move) => move.letter + (move.quarterTurns === -1 ? "'" : move.quarterTurns === 2 ? "2" : ""))
                  .join(" ")}
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || runnableMoves.length === 0}
              onClick={() => onRunMoves(runnableMoves)}
              className="h-9 min-w-40 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                  {runProgress
                    ? `Running ${runProgress.current}/${runProgress.total}…`
                    : "Executing…"}
                </>
              ) : (
                <>
                  <Play className="size-4" aria-hidden /> Run {runnableMoves.length} move
                  {runnableMoves.length === 1 ? "" : "s"} on the cube
                </>
              )}
            </Button>
            {pasteText.trim().length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPasteText("")}
                disabled={busy}
                className="h-9 text-white/60 hover:bg-white/10 hover:text-white"
              >
                Clear
              </Button>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            Counting uses the quarter-turn metric: X2 counts as 2 moves, same as
            manual dragging. The page scrolls back up so you can watch.
          </p>
        </div>
      </div>
    </section>
  );
}

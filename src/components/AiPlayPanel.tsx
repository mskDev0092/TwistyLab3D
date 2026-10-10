"use client";

/**
 * AiPlayPanel
 * ===========
 * The "let any AI play" bridge, rendered as a LEFT-HAND column that shares a
 * single screen with the cube (below it on small screens) - the cube stays
 * visible while pasted moves run, so nothing is ever off-screen.
 *
 * Step 1 - COPY: a self-contained prompt (response contract + notation +
 *          color legend + session notes) whose LAST block is the live
 *          machine-readable cube state. One click copies everything.
 * Step 2 - PASTE: the AI's reply goes here. It is parsed live (prose ignored,
 *          only face-turn tokens extracted, unicode primes tolerated); an
 *          optional `STATE_AFTER:` prediction is captured and verified after
 *          the run. Executing updates the move counter with every quarter turn.
 *
 * The state shown here refreshes after EVERY committed move (drag, scramble,
 * reset, loaded or pasted run), so always copy right before asking the AI.
 */

import { useMemo, useState } from "react";
import {
  Bot,
  Braces,
  Check,
  ClipboardCopy,
  Loader2,
  Play,
  Terminal,
  TriangleAlert,
} from "lucide-react";
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
  /** Face-turn tokens played so far (mirrors the prompt's HISTORY line). */
  history: string[];
  /** Progress of the running pasted-move sequence (incl. current token). */
  runProgress: { current: number; total: number; token: string } | null;
  /** Verdict of comparing the AI's STATE_AFTER with the real result. */
  verify: { match: boolean } | null;
  /** Execute parsed moves on the cube (parent owns the animation queue). */
  onRunMoves: (moves: ParsedMove[], predictedState?: string) => void;
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

/** Pull the optional `STATE_AFTER: <54 chars>` prediction out of a reply. */
function extractPrediction(text: string): string | undefined {
  const match = /STATE_AFTER\s*[:=]\s*([URFDLBurfdlb]{54})/.exec(text);
  return match ? match[1].toUpperCase() : undefined;
}

export default function AiPlayPanel({
  facelets,
  moveCount,
  isSolved,
  busy,
  history,
  runProgress,
  verify,
  onRunMoves,
}: AiPlayPanelProps) {
  const [pasteText, setPasteText] = useState("");

  const stateReady = isFaceletString(facelets);
  const prompt = useMemo(
    () =>
      stateReady
        ? buildAiPrompt({ facelets, moveCount, isSolved, history })
        : "Waiting for the 3D cube to initialize...",
    [stateReady, facelets, moveCount, isSolved, history],
  );

  const { moves, ignored } = useMemo(() => parseMoveSequence(pasteText), [pasteText]);
  const predictedState = useMemo(() => extractPrediction(pasteText), [pasteText]);
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      {/* ------------------------------ header ------------------------------ */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2">
            <Bot className="size-5 text-emerald-300" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-white">
              AI Play{" "}
              <span className="font-normal text-white/40">— any AI can solve it</span>
            </h2>
            <p className="text-[11px] leading-snug text-white/45">
              Open protocol · copy → paste → watch the cube run
            </p>
          </div>
        </div>
        <span
          aria-live="polite"
          className="shrink-0 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/55"
        >
          Moves: {moveCount} · {isSolved ? "solved" : "scrambled"}
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
          aria-label="AI prompt with the current cube state at the end"
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
            className="h-8 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <ClipboardCopy className="size-3.5" aria-hidden /> Copy full prompt
          </Button>
          <Button
            size="sm"
            disabled={!stateReady}
            onClick={() => void handleCopy(facelets, "Facelet state")}
            className="h-8 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            variant="outline"
          >
            <Braces className="size-3.5" aria-hidden /> Copy state only
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          The 54-char Kociemba string (order U R F D L B) closes the prompt, so
          dedicated solvers accept it too. The prompt asks the AI to answer with
          a MOVES line — and optionally a matching STATE_AFTER prediction.
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
          aria-label="Paste AI reply with cube moves here"
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={"e.g.\nMOVES: R U R' U' F2 D L' B2\nSTATE_AFTER: UUUUUUUUU..."}
          rows={3}
          className="min-h-20 resize-y bg-black/40 font-mono text-[11px] leading-relaxed text-white/90 placeholder:text-white/25"
        />

        {/* Parse feedback */}
        <div className="mt-2 space-y-1.5" aria-live="polite">
          {pasteText.trim().length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {moves.length > 0 ? (
                <span className="flex items-center gap-1.5 font-medium text-emerald-300">
                  <Check className="size-3.5" aria-hidden />
                  {moves.length} move{moves.length === 1 ? "" : "s"} parsed
                  <span className="font-normal text-white/40">
                    ({moves.reduce((sum, move) => sum + Math.abs(move.quarterTurns), 0)}{" "}
                    quarter turns)
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
            <p className="max-h-16 overflow-y-auto rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-white/55">
              {moves.map((move) => move.letter + (move.quarterTurns === -1 ? "" : move.quarterTurns === 1 ? "'" : "2")).join(" ")}
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
                  STATE_AFTER matched the real cube — prediction correct.
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
            className="h-8 min-w-36 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Running…
              </>
            ) : (
              <>
                <Play className="size-3.5" aria-hidden /> Run {runnableMoves.length} move
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
          The cube is right here — watch every turn live. Counter uses the
          quarter-turn metric (X2 = 2), same as manual dragging.
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
            <span className="font-mono text-[10px] text-white/75">window.RubiksCubeAPI</span>{" "}
            — drive the cube from any console or script:{" "}
            <span className="font-mono text-[10px] text-white/75">
              getFacelets() · getState() · getPrompt() · applyMoves(&quot;R U R&apos;&quot;)
              · applyFacelets(&quot;…&quot;) · scramble() · reset() · isSolved() · help()
            </span>
          </li>
          <li>
            Deep-link a position: append{" "}
            <span className="font-mono text-[10px] text-white/75">#state=&lt;54 facelets&gt;</span>{" "}
            to the URL and the cube loads it (must be physically reachable).
          </li>
          <li>
            Machine-readable app card for crawlers &amp; agents:{" "}
            <span className="font-mono text-[10px] text-white/75">/llms.txt</span> and{" "}
            <span className="font-mono text-[10px] text-white/75">/robots.txt</span> (all
            bots allowed).
          </li>
          <li>
            No login, no API key, no rate limit — the full play protocol travels
            inside the copied prompt, so any LLM, solver or agent can join.
          </li>
        </ul>
      </details>

      <p className="mt-auto pt-1 text-center text-[10px] text-white/30">
        Vanilla Three.js · Next.js static export · open protocol for every bot
      </p>
    </div>
  );
}

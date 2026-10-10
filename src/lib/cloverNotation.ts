/**
 * cloverNotation
 * ==============
 * Move notation, state encoding and the remote-play prompt for the Clover
 * Pyramid — the corner-disk twisting puzzle on a tetrahedron. The four corners
 * are disks A B C D, each turning in 60-degree detents.
 *
 * Notation (compact, easy for an AI to emit):
 *   X      = turn disk X 60 degrees (one detent)
 *   X'     = 60 degrees the other way
 *   X2     = 120 degrees, X2' = -120 degrees
 *   X3     = 180 degrees, X3' = -180 degrees
 * where X is one of A B C D.
 *
 * State code (18 chars, machine-readable):
 *   chars 0..11 = the 12 petal slots, grouped by face A B C D (3 petals each,
 *                 ordered by ascending corner). Each char is the colour-face
 *                 digit "0".."3" of the petal sitting there, or "e" if an edge
 *                 piece has slid onto that slot.
 *   chars 12..17 = the 6 edge slots (one per tetrahedron edge). "e" when an
 *                 edge piece sits there, else the petal's colour digit.
 * A SOLVED pyramid reads "000111222333eeeeee".
 */

import {
  DISK_LABELS,
  DETENT,
  FACE_COLOR_NAMES,
  type CloverMove,
} from "@/lib/cloverPyramid";

/** The solved 18-char state code (face-major petals, then edges). */
export const SOLVED_CLOVER_CODE = "000111222333eeeeee";

/** True when `value` looks like an 18-char Clover Pyramid state code. */
export function isCloverStateCode(value: string): boolean {
  return /^[0-3e?]{18}$/.test(value);
}

/** Disk letter for a move, e.g. "B". */
export function diskLetter(disk: number): string {
  return DISK_LABELS[disk] ?? "?";
}

/** Compact token for one move, e.g. "A", "B'", "C2", "D3'". */
export function cloverMoveToken(move: CloverMove): string {
  const magnitude = Math.abs(move.steps);
  const suffix = `${magnitude > 1 ? magnitude : ""}${move.steps < 0 ? "'" : ""}`;
  return `${diskLetter(move.disk)}${numberPart(move.steps)}${primePart(move.steps)}`;
}

function numberPart(steps: number): string {
  const magnitude = Math.abs(steps);
  return magnitude > 1 ? String(magnitude) : "";
}

function primePart(steps: number): string {
  return steps < 0 ? "'" : "";
}

/** Build the full remote-play prompt with the live state at the end. */
export function buildCloverAiPrompt(input: {
  stateCode: string;
  moveCount: number;
  isSolved: boolean;
  history?: string[];
}): string {
  const { stateCode, moveCount, isSolved } = input;
  const history = input.history ?? [];
  const petals = stateCode.slice(0, 12);
  const edges = stateCode.slice(12, 18);
  const group = (face: number): string => petals.slice(face * 3, face * 3 + 3);

  const pretty = (chars: string): string =>
    [...chars]
      .map((c) =>
        c === "e" ? "edge" : c === "?" ? "?" : FACE_COLOR_NAMES[Number(c)] ?? c,
      )
      .join(" ");

  const lines: string[] = [
    "# CLOVER PYRAMID — REMOTE-PLAY PROTOCOL v1",
    "You are remote-controlling a REAL interactive 3D Clover Pyramid jumbling puzzle in a web app.",
    "Your move sequence runs on the actual puzzle, one animated 60-degree turn at a time; the turn counter updates live.",
    "",
    "## HOW TO REPLY (strict)",
    "Put exactly ONE move line at the end of your reply:",
    "MOVES: <space-separated disk turns>",
    "Optionally add ONE prediction line:",
    "STATE_AFTER: <the 18-character state code you predict AFTER your moves>",
    "- The app compares STATE_AFTER with the real result and shows whether it matched.",
    "- If the pyramid is already solved, reply exactly: Already solved",
    "",
    "## MOVE NOTATION",
    "- The four corner disks are lettered A B C D. Each turns in 60-degree detents.",
    "- X   = turn disk X by 60 degrees (one detent).",
    "- X'  = 60 degrees the other way.",
    "- X2  = 120 degrees, X2' = -120 degrees, X3 = 180 degrees, X3' = -180 degrees.",
    "- Example sequence: A B' C2 A' D3' B2",
    "- Only turns of disks A B C D are supported; anything else is ignored.",
    "",
    "## THE PUZZLE (how it moves)",
    "- The pyramid has 4 triangular faces; each face should show ONE colour when solved.",
    "- Each corner disk carries 3 coloured 'petals' plus 3 white shared-edge pieces.",
    "- A 60-degree (jumbling) turn swaps each petal with a neighbouring edge piece, so pieces travel BETWEEN corners. 120-degree turns keep petals on their own face but still move edges.",
    "- Goal: every face shows a single colour again (each petal back on its own face colour).",
    "",
    "## STATE CODE (18 chars)",
    "  Each char is the colour of the petal sitting on that slot: " +
      FACE_COLOR_NAMES.map((n, i) => `${i}=${n}`).join(", ") +
      ", or 'e' if an edge piece sits there.",
    "- Chars 1-12 = petal slots, grouped by face A B C D (3 petals each, ascending corner).",
    "- Chars 13-18 = the 6 edge slots: 'e' if an edge sits there, else the petal's colour digit.",
    `- SOLVED = ${SOLVED_CLOVER_CODE}`,
    "",
    "## SESSION NOTES",
    "- HISTORY lists disk turns already played (oldest first).",
    "- After your moves run you receive an updated state in the same format; reply the same way again.",
    "",
    "==================== CURRENT CLOVER PYRAMID STATE (machine-readable) ====================",
    `STATUS: ${isSolved ? "ALREADY SOLVED" : "SCRAMBLED — not solved"}`,
    `MOVES_SO_FAR: ${moveCount}`,
    `HISTORY: ${history.length > 0 ? history.slice(-40).join(" ") : "(none — fresh puzzle)"}`,
    `STATE_CODE: ${stateCode}`,
    `PETALS (face A: ${group(0)} · B: ${group(1)} · C: ${group(2)} · D: ${group(3)}):`,
    `  ${pretty(petals)}`,
    `EDGES (${edges}):`,
    `  ${pretty(edges)}`,
    "========================================================================================",
    isSolved
      ? "The state above is already solved — reply 'Already solved' if you agree."
      : "Your turn: solve the Clover Pyramid. Reply with the 'MOVES: ...' line (and optionally 'STATE_AFTER: ...').",
  ];
  return lines.join("\n");
}

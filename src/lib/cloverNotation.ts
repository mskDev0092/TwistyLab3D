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
  const number = magnitude > 1 ? String(magnitude) : "";
  return `${diskLetter(move.disk)}${number}${move.steps < 0 ? "'" : ""}`;
}

/** Pull the optional `STATE_AFTER: <18 chars>` prediction out of a reply. */
export function extractCloverPrediction(text: string): string | undefined {
  const match = /STATE_AFTER\s*[:=]\s*([0-3e?]{18})/i.exec(text);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Isolate the move payload: everything after a `MOVES:` marker (to the end of
 * that line) when present, otherwise the whole text. Parsing only the marker
 * keeps prose from leaking into the move list.
 */
function moveSection(text: string): string {
  const marker = /MOVES\s*[:=]\s*([^\n\r]*)/i.exec(text);
  return marker ? marker[1] : text;
}

export interface ParsedCloverSequence {
  moves: CloverMove[];
  tokens: string[];
  /** Unrecognised word-ish tokens found in the move section. */
  ignored: string[];
}

/**
 * Parse disk turns out of a pasted AI reply. Only standalone `A`, `B2`, `C'`,
 * `D3'`-style tokens count, and each must be bounded by a non-letter on both
 * sides so ordinary words (e.g. "A good move") are not misread as turns.
 */
export function parseCloverMoveSequence(text: string): ParsedCloverSequence {
  const section = moveSection(text);
  const letters = DISK_LABELS.join("");
  const re = new RegExp(`(?:^|[^A-Za-z0-9])([${letters}][1-3]?['\\u2032]?)(?![A-Za-z0-9])`, "g");

  const moves: CloverMove[] = [];
  const tokens: string[] = [];
  for (const match of section.matchAll(re)) {
    const token = match[1];
    const parsed = parseCloverToken(token);
    if (parsed) {
      moves.push(parsed);
      tokens.push(cloverMoveToken(parsed));
    }
  }

  // Surface anything that looked like it wanted to be a move but was not.
  const stripped = section.replace(re, " ");
  const ignored = (stripped.match(/[A-Za-z][A-Za-z']*/g) ?? []).filter(
    (word) => word.length > 1,
  );

  return { moves, tokens, ignored: ignored.slice(0, 8) };
}

function parseCloverToken(token: string): CloverMove | null {
  const match = /^([A-Da-d])([1-3])?(['\u2032]?)$/.exec(token);
  if (!match) return null;
  const disk = DISK_LABELS.indexOf(
    match[1].toUpperCase() as (typeof DISK_LABELS)[number],
  );
  if (disk < 0) return null;
  const magnitude = match[2] ? Number(match[2]) : 1;
  const negative = match[3] === "'" || match[3] === "\u2032";
  return { disk, steps: negative ? -magnitude : magnitude };
}

/** Human token with degrees, e.g. "B −120°". */
export function cloverMoveLabel(move: CloverMove): string {
  const deg = Math.round((move.steps * DETENT * 180) / Math.PI);
  const sign = deg < 0 ? "\u2212" : "+";
  return `${diskLetter(move.disk)} ${sign}${Math.abs(deg)}\u00b0`;
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

/**
 * Cube notation utilities (pure functions - no THREE.js, no React).
 *
 * Shared vocabulary between the interactive cube, the AI Play panel and any
 * external solver / LLM:
 *
 * - Face letters: U (top), R (right), F (front), D (bottom), L (left),
 *   B (back). Faces are FIXED in space; colors belong to faces.
 * - Kociemba facelet string: 54 characters, faces in order U R F D L B, each
 *   face read row-major from its outside view. A solved cube is
 *   "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB".
 * - Move tokens: X, X' (counter-clockwise), X2 (180 degrees).
 */

/** Name of one of the three principal axes of the lattice. */
export type PrincipalAxisName = "x" | "y" | "z";

/** Index into the color table. Order: +X, -X, +Y, -Y, +Z, -Z. */
export type FaceColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** One of the six face-turn letters. */
export type FaceMoveLetter = "U" | "R" | "F" | "D" | "L" | "B";

/** Face letter of each color index (matches FACE_COLORS order in the logic). */
export const COLOR_LETTER_BY_INDEX: readonly string[] = [
  "R", // +X red
  "L", // -X orange
  "U", // +Y white
  "D", // -Y yellow
  "F", // +Z green
  "B", // -Z blue
];

/** Human color name of each color index (for the AI prompt legend). */
export const COLOR_NAME_BY_INDEX: readonly string[] = [
  "Red",
  "Orange",
  "White",
  "Yellow",
  "Green",
  "Blue",
];

/** Which slice a face turn acts on. Layer is the grid coordinate along axis. */
export const FACE_MOVE_AXIS: Record<
  FaceMoveLetter,
  { axis: PrincipalAxisName; layer: -1 | 1 }
> = {
  U: { axis: "y", layer: 1 },
  D: { axis: "y", layer: -1 },
  R: { axis: "x", layer: 1 },
  L: { axis: "x", layer: -1 },
  F: { axis: "z", layer: 1 },
  B: { axis: "z", layer: -1 },
};

/** Block index (0-4 in units of 9 facelets) of each face in the state string. */
const FACE_BLOCK: Record<FaceMoveLetter, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

/** True when the string looks like a valid 54-facelet cube state. */
export function isFaceletString(value: string): boolean {
  return /^[URFDLB]{54}$/.test(value);
}

/* ---------------------------------------------------------------------------
 * Parsing pasted AI replies into executable moves
 * ------------------------------------------------------------------------- */

/** One parsed move. quarterTurns: -1 = CW seen from the face, 1 = CCW, 2 = 180°. */
export interface ParsedMove {
  letter: FaceMoveLetter;
  quarterTurns: -1 | 1 | 2;
}

// Valid tokens: R, R', R2, R2', R'2. Apostrophe is the prime modifier and is
// never stripped; other punctuation that AIs like to append is stripped.
const MOVE_TOKEN = /^([URFDLB])(2'|'2|2|')?$/;
const STRIP_EDGES = /^[.,!?;:()[\]{}*_~`"“”‘’\s]+|[.,!?;:()[\]{}*_~`"“”‘’\s]+$/g;
// Tokens that LOOK like cube notation but are unsupported (wide / slice /
// rotation moves) - surfaced to the user instead of being silently dropped.
const LOOKS_LIKE_MOVE = /^(?:[URFDLB][a-z]?[0-9']{0,2}|[MESXYZ])$/;

function modifierToTurns(modifier: string | undefined): -1 | 1 | 2 {
  // Angles follow the right-hand rule about the face's POSITIVE outward axis,
  // so a CLOCKWISE turn (bare "R", as seen from outside the face) is -1.
  if (!modifier) return -1;
  if (modifier.includes("2")) return 2;
  return 1; // apostrophe prime = counter-clockwise = +1
}

/**
 * Extract every supported move from free-form text (an AI reply, a solver
 * output, a chat message...). Prose is ignored; tokens that resemble cube
 * notation but are not supported (M, E, S, x/y/z, wide moves) are reported.
 */
export function parseMoveSequence(text: string): {
  moves: ParsedMove[];
  ignored: string[];
} {
  const moves: ParsedMove[] = [];
  const ignored = new Set<string>();

  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(STRIP_EDGES, "");
    if (!token) continue;
    const match = MOVE_TOKEN.exec(token);
    if (match) {
      moves.push({
        letter: match[1] as FaceMoveLetter,
        quarterTurns: modifierToTurns(match[2]),
      });
    } else if (LOOKS_LIKE_MOVE.test(token) && ignored.size < 12) {
      ignored.add(token);
    }
  }
  return { moves, ignored: [...ignored] };
}

/* ---------------------------------------------------------------------------
 * State rendering for AI consumption
 * ------------------------------------------------------------------------- */

/**
 * Unfolded cross-shaped net of the facelet string, aligned for a monospace
 * font. Block order in `facelets`: U R F D L B (indices 0-5).
 */
export function buildFaceletNet(facelets: string): string {
  const row = (block: number, r: number): string =>
    `${facelets[block * 9 + r * 3]} ${facelets[block * 9 + r * 3 + 1]} ${facelets[block * 9 + r * 3 + 2]}`;
  const pad = "        ";
  return [
    `${pad}+-------+`,
    `${pad}| ${row(0, 0)} |   U (top, B touches its top row)`,
    `${pad}| ${row(0, 1)} |`,
    `${pad}| ${row(0, 2)} |`,
    "+-------+-------+-------+-------+",
    `| ${row(4, 0)} | ${row(2, 0)} | ${row(1, 0)} | ${row(5, 0)} |   L / F / R / B (U at top of each)`,
    `| ${row(4, 1)} | ${row(2, 1)} | ${row(1, 1)} | ${row(5, 1)} |`,
    `| ${row(4, 2)} | ${row(2, 2)} | ${row(1, 2)} | ${row(5, 2)} |`,
    "+-------+-------+-------+-------+",
    `${pad}| ${row(3, 0)} |   D (bottom, F touches its top row)`,
    `${pad}| ${row(3, 1)} |`,
    `${pad}| ${row(3, 2)} |`,
    `${pad}+-------+`,
  ].join("\n");
}

/** Everything an external AI needs to solve the cube, as one copyable prompt. */
export function buildAiPrompt(input: {
  facelets: string;
  moveCount: number;
  isSolved: boolean;
}): string {
  const { facelets, moveCount, isSolved } = input;
  const lines: string[] = [
    "Solve this 3x3 Rubik's Cube. You are controlling a real interactive cube app: the moves in your reply will be executed literally, in order.",
    "",
    "MOVE NOTATION (standard Singmaster):",
    '- Faces are fixed in space: U = Up/top, D = Down/bottom, L = Left, R = Right, F = Front, B = Back. They are defined by position, not by color.',
    '- "X" = turn face X 90 degrees CLOCKWISE as seen when looking directly at that face from outside the cube. "X\'" = 90 degrees counter-clockwise. "X2" = 180 degrees.',
    "- Use ONLY face turns. Do NOT use cube rotations (x/y/z), wide moves (u/r/f/...), or slice moves (M/E/S).",
    "",
    "COLOR LEGEND (color of each face center in this cube):",
    "- U = White, R = Red, F = Green, D = Yellow, L = Orange, B = Blue",
    "",
    `CURRENT STATUS: ${isSolved ? "Already solved." : "Scrambled - not solved."} ${moveCount} quarter-turn move(s) played so far.`,
    "",
    "CURRENT STATE as Kociemba facelet string (54 chars, faces in order U R F D L B, 9 chars each, each face read row-major from its own outside view):",
    facelets,
    "",
    "Same state as an unfolded net (each letter is the color of that sticker, per the legend):",
    "",
    buildFaceletNet(facelets),
    "",
    "YOUR TASK:",
    "1. Work out a correct solution with any method (layer-by-layer, CFOP, two-phase, ...).",
    "2. Put the final move sequence on the LAST line of your reply: space-separated tokens like  R U R' U' F2 D L' B2",
    "3. Keep it correct and reasonably short (under ~60 moves). No commentary after the move line.",
  ];
  if (isSolved) {
    lines.push("", "Note: the cube is already solved. If you agree, reply exactly: Already solved");
  }
  return lines.join("\n");
}

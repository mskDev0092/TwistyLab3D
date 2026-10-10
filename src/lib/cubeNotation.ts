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

/** The canonical solved-state facelet string. */
export const SOLVED_FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

/** True when the string looks like a valid 54-facelet cube state. */
export function isFaceletString(value: string): boolean {
  return /^[URFDLB]{54}$/.test(value);
}

/** Canonical token for a parsed move: R, R', R2. */
export function moveToToken(move: ParsedMove): string {
  return (
    move.letter +
    (move.quarterTurns === 1 ? "'" : move.quarterTurns === 2 ? "2" : "")
  );
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
 *
 * Tolerates the unicode primes AIs love to emit: R′ R’ R´ all parse as R'.
 */
export function parseMoveSequence(text: string): {
  moves: ParsedMove[];
  ignored: string[];
} {
  const moves: ParsedMove[] = [];
  const ignored = new Set<string>();

  // Normalize look-alike primes BEFORE tokenizing, otherwise the edge-stripper
  // would silently eat a trailing ’ / ′ and turn R' into R (a wrong move!).
  const normalized = text.replace(/[′’´]/g, "'");

  for (const raw of normalized.split(/[\s,;]+/)) {
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

/**
 * Everything an external AI needs to play the cube, as one copyable prompt.
 *
 * Contract of the generated text:
 *   - instructions and response format FIRST (a strict `MOVES:` reply line,
 *     plus an optional `STATE_AFTER:` line asking the AI to predict the
 *     resulting state in the SAME facelet format, which the app verifies),
 *   - the machine-readable CURRENT CUBE STATE block LAST, so it is trivial
 *     to find at the very end of the prompt.
 */
export function buildAiPrompt(input: {
  facelets: string;
  moveCount: number;
  isSolved: boolean;
  /** Move tokens played so far, oldest first (best effort, face turns only). */
  history?: string[];
}): string {
  const { facelets, moveCount, isSolved } = input;
  const history = input.history ?? [];

  const lines: string[] = [
    "# RUBIK'S CUBE — REMOTE-PLAY PROTOCOL v2",
    "You are remote-controlling a REAL interactive 3D Rubik's Cube running in a web app.",
    "The move sequence in your reply is executed on the actual cube, one animated turn at a time, and the move counter updates live.",
    "",
    "## HOW TO REPLY (strict)",
    "Put exactly ONE move line at the end of your reply:",
    "MOVES: <space-separated face turns>",
    "Then optionally add ONE prediction line (it helps the human verify you):",
    "STATE_AFTER: <the 54-character facelet string you predict AFTER your moves, in the same format as the state below>",
    "- The app compares STATE_AFTER with the real result and shows whether your prediction matched.",
    "- Omit STATE_AFTER if you are not confident. Put nothing after it.",
    "- If the cube is already solved, reply exactly: Already solved",
    "",
    "## MOVE NOTATION (standard Singmaster)",
    "- Faces are FIXED IN SPACE, defined by position — not by color:",
    "  U = Up/top, D = Down/bottom, F = Front, B = Back, R = Right, L = Left.",
    "- X = turn face X 90° CLOCKWISE as seen when looking directly at that face from outside the cube.",
    "- X' = 90° counter-clockwise. X2 = 180°. Example sequence: R U R' U' F2 D L' B2",
    "- ONLY the six face turns U R F D L B are supported.",
    "  Cube rotations (x y z), wide moves (u r f d l b) and slice moves (M E S) are NOT supported and are skipped.",
    "",
    "## COLOR SCHEME (fixed; centers never leave their face)",
    "U center = White, R center = Red, F center = Green, D center = Yellow, L center = Orange, B center = Blue.",
    "",
    "## STATE FORMAT (Kociemba facelets)",
    "- One string of 54 letters: faces in order U R F D L B, 9 letters per face.",
    "- Each face is read row-major (left→right, top→bottom) as seen looking straight at that face from OUTSIDE the cube.",
    `- A SOLVED cube reads: ${SOLVED_FACELETS}`,
    "- Every letter is a COLOR (legend above): which sticker currently sits on that facelet.",
    "- The UNFOLDED NET renders the same state spatially: U on top, L F R B in the middle row, D at the bottom.",
    "",
    "## SESSION NOTES",
    "- HISTORY lists the face turns already played (oldest first) — use it for context.",
    "- After your moves execute you may receive an updated state in this exact format; reply the same way again. The loop can repeat indefinitely.",
    "",
    "==================== CURRENT CUBE STATE (machine-readable) ====================",
    `STATUS: ${isSolved ? "ALREADY SOLVED" : "SCRAMBLED — not solved"}`,
    `MOVES_SO_FAR: ${moveCount}   (quarter-turn metric: X2 counts as 2)`,
    `HISTORY: ${history.length > 0 ? history.slice(-40).join(" ") : "(none — fresh cube)"}`,
    "FACELETS (order U R F D L B · 9 chars each · row-major per face):",
    facelets,
    "UNFOLDED NET (top U · middle L F R B · bottom D):",
    "",
    buildFaceletNet(facelets),
    "",
    "================================================================================",
    isSolved
      ? "The state above is already solved — reply 'Already solved' if you agree."
      : "Your turn: solve the cube. Reply with the 'MOVES: ...' line (and optionally 'STATE_AFTER: ...').",
  ];
  return lines.join("\n");
}

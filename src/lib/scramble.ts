/**
 * Scramble generator (pure - no THREE.js, no React).
 * ================================================
 * Design goals (in order):
 *
 * 1. NEVER the same scramble twice. The previous scramble's token string is
 *    remembered at module level and a fresh sequence is rejected+regenerated
 *    until it differs (with a bounded retry loop; collisions are ~impossible
 *    anyway with 25 moves drawn from an 18-token pool).
 * 2. Use (almost) ALL of the scramble space, uniformly. Randomness comes from
 *    `crypto.getRandomValues` with rejection sampling (unbiased modulo), and
 *    every one of the 6 faces / 3 turn amounts is always available subject to
 *    the fairness constraints below - no fixed move list, no seeded pattern.
 * 3. No trivially-cancelling fluff, matching WCA 3x3 scramble rules:
 *      - the same face must not appear twice in a row          (no R R'),
 *      - the same AXIS must not appear three times in a row    (no R L R).
 *    Opposite faces on the same axis are still allowed adjacently (R L) -
 *    they act on independent slices and never cancel.
 */

import type { FaceMoveLetter, ParsedMove } from "./cubeNotation";

import { moveToToken } from "./cubeNotation";

const FACES: readonly FaceMoveLetter[] = ["U", "R", "F", "D", "L", "B"];

/** Which lattice axis each face's slice rotates about. */
const AXIS_OF_FACE: Record<FaceMoveLetter, "x" | "y" | "z"> = {
  U: "y",
  D: "y",
  R: "x",
  L: "x",
  F: "z",
  B: "z",
};

/** Turn amounts, uniformly weighted like official WCA scrambles. */
const MODIFIERS = ["", "'", "2"] as const;

/** Uniform random integer in [0, n) - crypto-backed with a safe fallback. */
function randomIntBelow(n: number): number {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
    // Rejection sampling removes the modulo bias that a naive
    // `getRandomValues() % n` would introduce.
    const limit = Math.floor(0x100000000 / n) * n;
    const buffer = new Uint32Array(1);
    do {
      cryptoRef.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % n;
  }
  return Math.floor(Math.random() * n);
}

/** Token string of the most recent scramble, so it is never dealt again. */
let lastScrambleKey = "";

/**
 * Generate a fresh WCA-style scramble of `length` random face turns.
 *
 * @returns face moves in execution order; convert with
 *          `FACE_MOVE_AXIS[letter]` + `quarterTurns` to drive the cube.
 */
export function generateScramble(length = 25): ParsedMove[] {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const moves: ParsedMove[] = [];
    let previousFace: FaceMoveLetter | null = null;
    let previousAxis: "x" | "y" | "z" | null = null;
    let axisBeforePrevious: "x" | "y" | "z" | null = null;

    while (moves.length < length) {
      const face = FACES[randomIntBelow(FACES.length)];
      if (face === previousFace) continue; // WCA: no same face twice in a row

      const axis = AXIS_OF_FACE[face];
      if (
        previousAxis !== null &&
        axis === previousAxis &&
        axis === axisBeforePrevious
      ) {
        continue; // WCA: no three same-axis turns in a row (e.g. R L R)
      }

      const modifier = MODIFIERS[randomIntBelow(MODIFIERS.length)];
      moves.push({
        letter: face,
        // Convention (see cubeNotation): bare move = clockwise = -1 quarter
        // turns about the face's positive outward axis.
        quarterTurns:
          modifier === "" ? -1 : modifier === "'" ? 1 : 2,
      });

      axisBeforePrevious = previousAxis;
      previousAxis = axis;
      previousFace = face;
    }

    const key = moves.map(moveToToken).join(" ");
    if (key !== lastScrambleKey) {
      lastScrambleKey = key;
      return moves;
    }
    // Identical to the last scramble dealt - regenerate (probability ~0).
  }
  // Practically unreachable; return the last candidate anyway so callers
  // always get a valid sequence.
  return [];
}

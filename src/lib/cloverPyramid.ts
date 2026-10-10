/**
 * CloverPyramidLogic
 * ==================
 * The state + math layer of "Clover Pyramid", a JUMBLING twisty puzzle that
 * lives on a regular tetrahedron. Like RubiksCubeLogic it is deliberately
 * free of React and of any DOM/WebGL access, so the whole puzzle can be unit
 * tested and the renderer stays a thin skin over it.
 *
 * Why it "jumbles"
 * ----------------
 * A classical twisty puzzle only turns in steps that map its cut lines onto
 * themselves (90 deg for a cube). Clover-style puzzles instead cut the surface
 * with CIRCLES centred on the corners; where two circles overlap a piece does
 * not belong to a single corner any more. This implementation models exactly
 * that:
 *
 *   - 4 corner "clover" disks, one per tetrahedron vertex.
 *   - 12 PETAL pieces, each owned by exactly one corner (3 per corner).
 *   - 6 EDGE pieces, each SHARED by the two corners of its edge (overlap).
 *   - 4 fixed CENTRE pieces that anchor each face.
 *
 * A move rotates every piece in a disk about that vertex's axis by k * 60 deg.
 * Multiples of 120 deg are the clean, "obvious" turns (they map the three
 * faces around a corner onto each other). The odd 60 deg multiples are the
 * JUMBLING turns: they leave pieces tilted mid-face, and because edge pieces
 * answer to two corners at once the whole thing becomes deeply unintuitive.
 *
 * Every move is an exact group element (a fixed set of pieces rigidly rotated
 * about a fixed axis), so the puzzle is always exactly invertible: the inverse
 * of any scramble restores the solved state. That keeps the puzzle honest and
 * the "solved" test exact.
 */

import * as THREE from "three";

/** What kind of surface piece this is. */
export type CloverPieceKind = "petal" | "edge" | "center";

/** One coloured surface piece. */
export interface CloverPiece {
  readonly id: number;
  readonly kind: CloverPieceKind;
  /** Base colour (hex) - kept as the piece's identity while it moves. */
  readonly color: number;
  /** Solved position / orientation (a point on the tetra surface). */
  readonly homeDir: THREE.Vector3;
  readonly homeQuat: THREE.Quaternion;
  /** Face index this piece sits on when solved (for the legend / solved test). */
  readonly face: number;
  /** Corner this piece visually points at (-1 for centres). */
  readonly vertex: number;
  /** Disk indices that can move this piece (1 for petals, 2 for edges). */
  readonly members: number[];
  /** Live position (unit direction from the centre). */
  dir: THREE.Vector3;
  /** Live full orientation (so petals stay glued to the surface). */
  quat: THREE.Quaternion;
}

/** One discrete disk turn: `steps` detents of 60 degrees each (signed). */
export interface CloverMove {
  disk: number;
  steps: number;
}

/** Human label for each corner disk. */
export const DISK_LABELS = ["A", "B", "C", "D"] as const;

/** Base turn unit: 60 degrees. Every move is an integer number of these. */
export const DETENT = Math.PI / 3;

/** 360 / 60 - the number of distinct detent positions on a disk. */
export const DETENTS = 6;

/** Corner face colours (index = face / opposite vertex). */
export const FACE_COLORS = [0xf5a524, 0x22d3ee, 0xe879f9, 0x84cc16] as const;

/** Colour name of each face, for the legend. */
export const FACE_COLOR_NAMES = ["Amber", "Cyan", "Magenta", "Lime"] as const;

/** Neutral colour of the shared (overlap) edge pieces. */
export const EDGE_COLOR = 0xe4e9f2;

/** Regular-tetrahedron geometry. */
export const CIRCUMRADIUS = 1.72;
const INRADIUS = CIRCUMRADIUS / 3;

/** Unit direction of each tetrahedron vertex (corner / disk axis). */
export const VERTICES: THREE.Vector3[] = [
  new THREE.Vector3(1, 1, 1).normalize(),
  new THREE.Vector3(1, -1, -1).normalize(),
  new THREE.Vector3(-1, 1, -1).normalize(),
  new THREE.Vector3(-1, -1, 1).normalize(),
];

/** Outward normal of face `k` (the face opposite vertex `k`). */
export const FACE_NORMALS: THREE.Vector3[] = VERTICES.map((v) =>
  v.clone().multiplyScalar(-1),
);

/** Angular radius (radians) of the visible circular cut around each corner. */
export const DISK_CUT_ANGLE = THREE.MathUtils.degToRad(61);

/** Positional membership radius: pieces within this angle of a corner turn. */
export const MEMBERSHIP_ANGLE = THREE.MathUtils.degToRad(62);

/** Max angle from the nearest corner that still counts as grabbing a disk. */
export const DISK_GRAB_ANGLE = THREE.MathUtils.degToRad(72);

/** Build a quaternion whose local +Z is `z` and local +Y leans toward `yHint`. */
function basisQuat(z: THREE.Vector3, yHint: THREE.Vector3): THREE.Quaternion {
  const zAxis = z.clone().normalize();
  let yAxis = yHint
    .clone()
    .sub(zAxis.clone().multiplyScalar(yHint.dot(zAxis)));
  if (yAxis.lengthSq() < 1e-9) {
    // yHint was parallel to z: pick whichever world axis is least aligned with z.
    const ref =
      Math.abs(zAxis.x) < 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    yAxis = ref.clone().sub(zAxis.clone().multiplyScalar(ref.dot(zAxis)));
  }
  yAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

/** The two vertices of face `f` that are neither `f` nor `skip`. */
function otherVerticesOfFace(f: number, skip: number): [number, number] {
  const rest = [0, 1, 2, 3].filter((v) => v !== f && v !== skip);
  return [rest[0], rest[1]];
}

/** Every face index. */
const ALL_FACES = [0, 1, 2, 3];

/** Unordered vertex pairs (the 6 tetrahedron edges). */
const EDGES: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

/**
 * The whole puzzle: geometry, pieces, moves and solved detection.
 */
export class CloverPyramidLogic {
  /** Scene-graph root (kept at identity - the camera orbits, not the puzzle). */
  readonly root = new THREE.Group();

  /** All surface pieces (petals, edges, fixed centres). */
  readonly pieces: CloverPiece[] = [];

  /** Fixed petal slots, canonical order = face-major, vertex ascending. */
  readonly petalSlots: Array<{
    dir: THREE.Vector3;
    face: number;
    vertex: number;
    quat: THREE.Quaternion;
  }> = [];

  /** Fixed edge slots, one per tetrahedron edge (order = EDGES). */
  readonly edgeSlots: Array<{
    dir: THREE.Vector3;
    i: number;
    j: number;
    quat: THREE.Quaternion;
  }> = [];

  /** Snapshot of a live drag so it can be cancelled or snapped. */
  private grabbed: {
    disk: number;
    snapshot: Array<{
      piece: CloverPiece;
      dir0: THREE.Vector3;
      quat0: THREE.Quaternion;
    }>;
  } | null = null;

  constructor() {
    let id = 0;

    // --- 12 petals: corner i on face j (i != j) -------------------------
    const t = 0.3; // how far along the corner-to-centre direction the petal sits
    for (let i = 0; i < 4; i += 1) {
      for (const j of ALL_FACES) {
        if (j === i) continue;
        const [p, q] = otherVerticesOfFace(j, i);
        const point = new THREE.Vector3()
          .addScaledVector(VERTICES[i], 1 - 2 * t)
          .addScaledVector(VERTICES[p], t)
          .addScaledVector(VERTICES[q], t);
        const dir = point.clone().normalize();
        const normal = FACE_NORMALS[j];
        const quat = basisQuat(normal, VERTICES[i]);
        this.petalSlots.push({ dir: dir.clone(), face: j, vertex: i, quat });
        this.pieces.push({
          id: id++,
          kind: "petal",
          color: FACE_COLORS[j],
          homeDir: dir,
          homeQuat: quat,
          face: j,
          vertex: i,
          members: [i],
          dir: dir.clone(),
          quat: quat.clone(),
        });
      }
    }

    // Canonical display order for state read-out: group by face.
    this.petalSlots.sort((a, b) => a.face - b.face || a.vertex - b.vertex);

    // --- 6 shared edge pieces: one per tetrahedron edge -----------------
    // Placed EXACTLY on the edge midpoint. A petal also sits 54.74 deg from
    // its vertex, and around any vertex the 3 petals and 3 incident edges
    // alternate every 60 deg - so a 60 deg turn is an exact petal<->edge
    // permutation. The surface is therefore always perfectly tiled (no two
    // pieces ever coincide, nothing floats off the body).
    for (const [i, j] of EDGES) {
      const point = new THREE.Vector3()
        .addScaledVector(VERTICES[i], 0.5)
        .addScaledVector(VERTICES[j], 0.5);
      const dir = point.clone().normalize();
      // The two faces that share this edge.
      const adjacentFaces = ALL_FACES.filter((f) => f !== i && f !== j);
      const normal = FACE_NORMALS[adjacentFaces[0]]
        .clone()
        .add(FACE_NORMALS[adjacentFaces[1]])
        .normalize();
      // The leaf should lie ALONG the edge, so the tangent hint is the edge
      // line direction (perpendicular to the radial crease normal).
      const edgeHint = VERTICES[i].clone().sub(VERTICES[j]);
      const quat = basisQuat(normal, edgeHint);
      this.edgeSlots.push({ dir: dir.clone(), i, j, quat });
      this.pieces.push({
        id: id++,
        kind: "edge",
        color: EDGE_COLOR,
        homeDir: dir,
        homeQuat: quat,
        face: adjacentFaces[0],
        vertex: -1,
        members: [i, j],
        dir: dir.clone(),
        quat: quat.clone(),
      });
    }

    // --- 4 fixed centre pieces ------------------------------------------
    for (const f of ALL_FACES) {
      const dir = FACE_NORMALS[f].clone();
      const quat = basisQuat(FACE_NORMALS[f], VERTICES[(f + 1) % 4]);
      this.pieces.push({
        id: id++,
        kind: "center",
        color: FACE_COLORS[f],
        homeDir: dir,
        homeQuat: quat,
        face: f,
        vertex: -1,
        members: [],
        dir: dir.clone(),
        quat: quat.clone(),
      });
    }
  }

  /** The piece currently occupying a fixed slot direction (within 0.05°). */
  private occupantAt(dir: THREE.Vector3): CloverPiece | undefined {
    for (const piece of this.pieces) {
      if (piece.dir.dot(dir) > 0.999999) return piece;
    }
    return undefined;
  }

  /**
   * Machine-readable state: 12 petal slots (face-major, vertex ascending)
   * then 6 edge slots. Each char is the occupant's colour-face digit "0".."3"
   * for a petal, "e" for an (all-white) edge piece, or "?" if empty.
   */
  getStateCode(): string {
    let code = "";
    for (const slot of this.petalSlots) {
      const occ = this.occupantAt(slot.dir);
      code += occ
        ? occ.kind === "petal"
          ? String(occ.face)
          : occ.kind === "edge"
            ? "e"
            : "c"
        : "?";
    }
    for (const slot of this.edgeSlots) {
      const occ = this.occupantAt(slot.dir);
      code += occ
        ? occ.kind === "edge"
          ? "e"
          : occ.kind === "petal"
            ? String(occ.face)
            : "c"
        : "?";
    }
    return code;
  }

  /**
   * Visual solved check: every petal slot shows its face colour and every
   * edge slot holds an (identical white) edge piece. Edge pieces are
   * interchangeable, so only petal colours matter visually.
   */
  isSolved(): boolean {
    for (const slot of this.petalSlots) {
      const occ = this.occupantAt(slot.dir);
      if (!occ || occ.kind !== "petal" || occ.face !== slot.face) return false;
    }
    for (const slot of this.edgeSlots) {
      const occ = this.occupantAt(slot.dir);
      if (!occ || occ.kind !== "edge") return false;
    }
    return true;
  }

  /** True while a disk drag is in progress. */
  get isGrabbed(): boolean {
    return this.grabbed !== null;
  }

  /** Project a unit direction onto the tetrahedron surface. */
  surfacePoint(dir: THREE.Vector3, lift = 0): THREE.Vector3 {
    let best = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < 4; k += 1) {
      const d = FACE_NORMALS[k].dot(dir);
      if (d > bestDot) {
        bestDot = d;
        best = k;
      }
    }
    const scale = INRADIUS / bestDot;
    return dir.clone().multiplyScalar(scale + lift);
  }

  /** Face index whose plane the direction hits. */
  surfaceFace(dir: THREE.Vector3): number {
    let best = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < 4; k += 1) {
      const d = FACE_NORMALS[k].dot(dir);
      if (d > bestDot) {
        bestDot = d;
        best = k;
      }
    }
    return best;
  }

  /** Nearest corner disk to a surface direction, or -1 if too far away. */
  nearestDisk(dir: THREE.Vector3): number {
    let best = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < 4; i += 1) {
      const d = VERTICES[i].dot(dir);
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    }
    if (bestDot < Math.cos(DISK_GRAB_ANGLE)) return -1;
    return best;
  }

  /**
   * Start twisting `disk`. Membership is POSITIONAL: any piece currently
   * inside the disk's circular cut turns with it. A shared edge sitting on
   * the overlap therefore answers to both its corners, and slides out from
   * under a neighbour as soon as the other corner turns - the jumbling core.
   */
  beginTurn(disk: number): void {
    if (disk < 0 || disk > 3) return;
    const axis = VERTICES[disk];
    const cosLimit = Math.cos(MEMBERSHIP_ANGLE);
    const snapshot = this.pieces
      .filter((piece) => axis.dot(piece.dir) > cosLimit)
      .map((piece) => ({
        piece,
        dir0: piece.dir.clone(),
        quat0: piece.quat.clone(),
      }));
    this.grabbed = { disk, snapshot };
  }

  /** Rotate the grabbed disk to an arbitrary angle (live drag feedback). */
  setTurnAngle(angle: number): void {
    if (!this.grabbed) return;
    const axis = VERTICES[this.grabbed.disk];
    const qTotal = new THREE.Quaternion().setFromAxisAngle(axis, angle);

    // For the smooth orientation we interpolate between the canonical frames
    // of the two detent slots the current piece straddles, so a jumbling turn
    // settles the leaf onto the surface instead of snapping it at the end.
    const kTotal = angle / DETENT;
    const k0 = Math.floor(kTotal + 1e-9);
    const frac = kTotal - k0;
    const qa = new THREE.Quaternion().setFromAxisAngle(axis, k0 * DETENT);
    const qb = new THREE.Quaternion().setFromAxisAngle(axis, (k0 + 1) * DETENT);

    for (const entry of this.grabbed.snapshot) {
      entry.piece.dir.copy(entry.dir0).applyQuaternion(qTotal);
      const frameA = this.slotQuatFor(entry.dir0.clone().applyQuaternion(qa));
      const frameB = this.slotQuatFor(entry.dir0.clone().applyQuaternion(qb));
      if (frameA && frameB) {
        entry.piece.quat.copy(frameA).slerp(frameB, frac);
      } else {
        entry.piece.quat.copy(entry.quat0).premultiply(qTotal);
      }
    }
  }

  /** Canonical quaternion of the fixed slot a unit direction lands on. */
  private slotQuatFor(dir: THREE.Vector3): THREE.Quaternion | null {
    for (const slot of this.petalSlots) {
      if (slot.dir.dot(dir) > 0.999) return slot.quat;
    }
    for (const slot of this.edgeSlots) {
      if (slot.dir.dot(dir) > 0.999) return slot.quat;
    }
    return null;
  }

  /** Finish the grabbed disk at an exact detent count and return the move. */
  endTurn(steps: number): CloverMove {
    if (!this.grabbed) return { disk: -1, steps: 0 };
    const disk = this.grabbed.disk;
    const angle = steps * DETENT;
    this.setTurnAngle(angle);
    this.snapOrientations();
    this.grabbed = null;
    return { disk, steps };
  }

  /**
   * Re-seat every piece's orientation to the canonical frame of the slot it
   * now occupies. A rigid 60 deg jumbling turn would otherwise leave pieces
   * tilted ~15.8 deg off the surface; snapping keeps the body perfectly tiled
   * in every state, so a scrambled pyramid looks as clean as a solved one.
   */
  private snapOrientations(): void {
    for (const piece of this.pieces) {
      if (piece.kind === "center") continue;
      const slot =
        this.petalSlots.find((s) => s.dir.dot(piece.dir) > 0.999) ??
        this.edgeSlots.find((s) => s.dir.dot(piece.dir) > 0.999);
      if (slot) piece.quat.copy(slot.quat);
    }
  }

  /** Abort the grabbed disk, restoring the pre-drag state. */
  cancelTurn(): void {
    if (!this.grabbed) return;
    for (const entry of this.grabbed.snapshot) {
      entry.piece.dir.copy(entry.dir0);
      entry.piece.quat.copy(entry.quat0);
    }
    this.grabbed = null;
  }

  /** Apply one move immediately (no animation hooks). */
  applyMove(move: CloverMove): void {
    if (move.disk < 0 || move.steps === 0) return;
    this.beginTurn(move.disk);
    this.endTurn(move.steps);
  }

  /** Restore the pristine solved state. */
  reset(): void {
    this.grabbed = null;
    for (const piece of this.pieces) {
      piece.dir.copy(piece.homeDir);
      piece.quat.copy(piece.homeQuat);
    }
  }

  /** A short human token for one move, e.g. "B 120°" or "C −60°". */
  static moveToken(move: CloverMove): string {
    const deg = Math.round((move.steps * DETENT * 180) / Math.PI);
    const sign = deg < 0 ? "\u2212" : "+";
    return `${DISK_LABELS[move.disk]} ${sign}${Math.abs(deg)}\u00b0`;
  }
}

/**
 * Random jumbling scramble. `randomIntBelow` is crypto-backed when available.
 * The sequence mixes clean (even detents) and jumbling (odd detents) turns so
 * pieces genuinely leave their disks' clean orbits.
 */
export function generateCloverScramble(count = 22): CloverMove[] {
  const randomIntBelow = (n: number): number => {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
      const limit = Math.floor(0x100000000 / n) * n;
      const buffer = new Uint32Array(1);
      do {
        cryptoRef.getRandomValues(buffer);
      } while (buffer[0] >= limit);
      return buffer[0] % n;
    }
    return Math.floor(Math.random() * n);
  };

  const build = (): CloverMove[] => {
    const moves: CloverMove[] = [];
    let previousDisk = -1;
    let jumbling = false;
    while (moves.length < count) {
      const disk = randomIntBelow(4);
      if (disk === previousDisk) continue;
      const sign = randomIntBelow(2) === 0 ? 1 : -1;
      // Alternate clean 120-deg turns with odd 60-deg jumbling turns.
      const magnitude = jumbling ? 1 : 2;
      moves.push({ disk, steps: sign * magnitude });
      jumbling = !jumbling;
      previousDisk = disk;
    }
    return moves;
  };

  const signature = (moves: CloverMove[]): string =>
    moves.map((m) => `${m.disk}:${m.steps}`).join("|");

  // Guarantee every scramble differs from the previous one.
  let moves = build();
  for (let attempt = 0; attempt < 8 && signature(moves) === lastScramble; attempt += 1) {
    moves = build();
  }
  lastScramble = signature(moves);
  return moves;
}

let lastScramble = "";

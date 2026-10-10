/**
 * RubiksCubeLogic
 * ===============
 * The *state + math* layer of the puzzle, fully decoupled from React.
 *
 * Mental model
 * ------------
 * - The cube is 27 logical cubies living on an integer 3D lattice.
 *   Each cubie has a `grid` coordinate with every component in {-1, 0, 1}
 *   (e.g. the sticker in the very center of the red face sits at (1, 0, 0)).
 * - Visually, each cubie is a `THREE.Group` ("cubie.group") containing:
 *     1. a rounded black plastic body mesh, and
 *     2. between 1 and 3 colored sticker meshes on its *exterior* faces.
 * - All cubie groups are children of a single `root` group, which is kept at
 *   an identity transform. The camera orbits; the cube itself never rotates,
 *   so "world space" and "cube space" are always the same space. That makes
 *   every rotation we compute directly meaningful.
 *
 * The Pivot-Group trick (how a 3x3 slice rotates)
 * -----------------------------------------------
 * You cannot rotate 9 arbitrary meshes independently and keep them glued
 * together. Instead we:
 *
 *   1. SELECT   - collect the 9 cubies whose `grid` coordinate matches on one
 *                 axis (e.g. every cubie with grid.x === 1 is the R slice).
 *   2. GRAB     - create a temporary `THREE.Group` (the "pivot") at the origin
 *                 and `pivot.attach(cubie.group)` each of the 9 cubies.
 *                 `attach()` (NOT `add()`) re-parents while *preserving the
 *                 world transform*, so nothing visually jumps even though the
 *                 cubies now inherit the pivot's transform.
 *   3. ROTATE   - rotate the pivot around one principal axis. All 9 cubies
 *                 follow rigidly, like a real slice.
 *   4. COMMIT   - when the turn finishes (snapped to a multiple of 90 deg),
 *                 `root.attach(cubie.group)` each cubie back into the root
 *                 (again preserving world transform), snap its transform to
 *                 the exact lattice (kills floating-point drift), and apply
 *                 the same 90-degree rotation to the *logical* `grid`
 *                 coordinate so the math stays in sync with the visuals.
 *   5. DISCARD  - remove the now-empty pivot from the scene graph.
 *
 * Because a rotation by an exact multiple of 90 deg maps integer lattice
 * coordinates onto other integer coordinates, we can update the logical state
 * with a matrix multiply followed by `.round()` - no trig bookkeeping needed.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** One of the three principal axes of the lattice. */
export type PrincipalAxisName = "x" | "y" | "z";

/** Index into {@link FACE_COLORS} (order matches +X, -X, +Y, -Y, +Z, -Z). */
export type FaceColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** A signed quarter-turn count. -1 = 90 deg clockwise, 2 = 180 deg, etc. */
export type QuarterTurns = -2 | -1 | 0 | 1 | 2;

/** One discrete layer turn. */
export interface SliceMove {
  axis: PrincipalAxisName;
  /** Which slice: -1, 0 or 1 on the chosen axis. */
  layer: -1 | 0 | 1;
  quarterTurns: number;
}

/** Metadata for a single colored sticker. */
export interface StickerInfo {
  /** Sticker outward normal in *cubie-local* space (a unit principal vector). */
  readonly localNormal: THREE.Vector3;
  /** Which face color this sticker carries. */
  readonly colorIndex: FaceColorIndex;
}

/** One 3x3x3 building block: its scene-graph group plus its logical state. */
export interface Cubie {
  /** Visual group (black body + stickers). Position = grid * CUBIE_SPACING. */
  readonly group: THREE.Group;
  /** Logical lattice coordinate; every component stays in {-1, 0, 1}. */
  readonly grid: THREE.Vector3;
  /** Stickers on this cubie (used for solved-state detection). */
  readonly stickers: StickerInfo[];
  /** Snapshot of the solved-state grid, used by {@link reset}. */
  readonly initialGrid: THREE.Vector3;
}

// ---------------------------------------------------------------------------
// Tunable geometry constants
// ---------------------------------------------------------------------------

/** World-space distance between neighbouring cubie centers. */
export const CUBIE_SPACING = 1.03;

/** Half a turn, in radians. */
export const HALF_PI = Math.PI / 2;

const BODY_SIZE = 0.96; // black plastic body edge length
const BODY_SEGMENTS = 3; // rounded-corner tessellation
const BODY_RADIUS = 0.07; // rounded-corner radius
const STICKER_SIZE = 0.8; // sticker edge length
const STICKER_RADIUS = 0.15; // sticker corner radius
const STICKER_LIFT = 0.004; // raise sticker above the plastic to avoid z-fighting

/**
 * Official color scheme in BoxGeometry face order.
 * With white up (+Y) and green front (+Z): red right, orange left, blue back.
 */
export const FACE_COLORS = [
  0xc41e3a, // +X red
  0xff5800, // -X orange
  0xfefefe, // +Y white
  0xffd500, // -Y yellow
  0x009e60, // +Z green
  0x0051ba, // -Z blue
] as const;

/** Unit outward direction of each face, same order as {@link FACE_COLORS}. */
const FACE_DIRECTIONS: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const STICKER_FRONT = new THREE.Vector3(0, 0, 1); // ShapeGeometry faces +Z

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** Round every component of `v` into {-1, 0, 1}. */
function snapToLattice(v: THREE.Vector3): void {
  v.set(
    Math.max(-1, Math.min(1, Math.round(v.x))),
    Math.max(-1, Math.min(1, Math.round(v.y))),
    Math.max(-1, Math.min(1, Math.round(v.z))),
  );
}

/**
 * Project `v` onto the nearest principal axis and return a *new* unit vector
 * pointing the same way (e.g. (0.02, 0.99, 0.1) -> (0, 1, 0)).
 */
export function snapToPrincipalAxis(v: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(v.x) || 1, 0, 0);
  if (ay >= ax && ay >= az) return new THREE.Vector3(0, Math.sign(v.y) || 1, 0);
  return new THREE.Vector3(0, 0, Math.sign(v.z) || 1);
}

/** Name of the dominant axis of `v` plus the sign along that axis. */
export function dominantAxis(v: THREE.Vector3): {
  axis: PrincipalAxisName;
  sign: 1 | -1;
} {
  const snapped = snapToPrincipalAxis(v);
  const axis: PrincipalAxisName =
    snapped.x !== 0 ? "x" : snapped.y !== 0 ? "y" : "z";
  return { axis, sign: snapped[axis] > 0 ? 1 : -1 };
}

/**
 * Snap a quaternion to the nearest of the 24 axis-aligned orientations.
 * Valid ONLY when the rotation is already close to a 90-degree multiple -
 * which is always the case right after a slice turn has been tweened to its
 * snapped angle. We exploit the fact that such rotation matrices consist
 * purely of 0 / +/-1 entries, so rounding the matrix entries removes all
 * floating-point drift at once.
 */
function snapQuaternion(q: THREE.Quaternion): void {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const e = m.elements;
  for (let i = 0; i < 16; i += 1) e[i] = Math.round(e[i]);
  q.setFromRotationMatrix(m);
}

// ---------------------------------------------------------------------------
// The logic class
// ---------------------------------------------------------------------------

export class RubiksCubeLogic {
  /** Scene-graph root holding all 27 cubies. Add this to your THREE.Scene. */
  public readonly root: THREE.Group;

  /** Meshes a Raycaster should test against (all bodies + all stickers). */
  public readonly pickables: THREE.Object3D[] = [];

  private readonly cubies: Cubie[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  /** Temporary parent used while a slice is being rotated (null when idle). */
  private pivot: THREE.Group | null = null;
  private activeSlice: Cubie[] = [];
  private activeAxisVector = new THREE.Vector3(1, 0, 0);
  private activeAxisName: PrincipalAxisName = "x";
  private activeLayer: -1 | 0 | 1 = 0;

  public constructor() {
    this.root = new THREE.Group();
    this.root.name = "rubiksCube";
    this.build();
  }

  /** True while a slice is grabbed (mid-drag or mid-animation). */
  public get isSliceGrabbed(): boolean {
    return this.pivot !== null;
  }

  // -------------------------------------------------------------------------
  // Construction / teardown
  // -------------------------------------------------------------------------

  private build(): void {
    // Shared GPU resources: 1 body geometry + 1 sticker geometry + 7 materials
    // for the whole puzzle. Sharing keeps draw setup cheap and disposal trivial.
    const bodyGeometry = new RoundedBoxGeometry(
      BODY_SIZE,
      BODY_SIZE,
      BODY_SIZE,
      BODY_SEGMENTS,
      BODY_RADIUS,
    );
    const stickerGeometry = RubiksCubeLogic.createStickerGeometry();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x121216, // near-black plastic
      roughness: 0.4,
      metalness: 0.08,
    });
    const faceMaterials = FACE_COLORS.map(
      (color) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.22,
          metalness: 0,
        }),
    );

    this.geometries.push(bodyGeometry, stickerGeometry);
    this.materials.push(bodyMaterial, ...faceMaterials);

    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          const group = new THREE.Group();
          group.name = `cubie(${x},${y},${z})`;
          group.position.set(
            x * CUBIE_SPACING,
            y * CUBIE_SPACING,
            z * CUBIE_SPACING,
          );

          const stickers: StickerInfo[] = [];
          const stickerMeshes: THREE.Mesh[] = [];
          const grid = new THREE.Vector3(x, y, z);

          FACE_DIRECTIONS.forEach((dir, faceIndex) => {
            // A face is on the outside iff dir . grid === 1. Interior faces
            // stay bare black plastic - the classic internal look.
            if (Math.round(dir.dot(grid)) !== 1) return;

            const sticker = new THREE.Mesh(
              stickerGeometry,
              faceMaterials[faceIndex],
            );
            sticker.position
              .copy(dir)
              .multiplyScalar(BODY_SIZE / 2 + STICKER_LIFT);
            sticker.quaternion.setFromUnitVectors(STICKER_FRONT, dir);
            group.add(sticker);
            this.pickables.push(sticker);

            stickers.push({
              localNormal: dir.clone(),
              colorIndex: faceIndex as FaceColorIndex,
            });
            stickerMeshes.push(sticker);
          });

          const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
          body.castShadow = true;
          body.receiveShadow = true;
          group.add(body);
          this.pickables.push(body);

          const cubie: Cubie = {
            group,
            grid,
            stickers,
            initialGrid: grid.clone(),
          };
          // Raycast results point back to the owning cubie through userData.
          body.userData = { cubie };
          group.userData = { cubie };
          stickerMeshes.forEach((mesh, index) => {
            mesh.userData = { cubie, localNormal: stickers[index].localNormal };
          });

          this.cubies.push(cubie);
          this.root.add(group);
        }
      }
    }
  }

  /** A rounded-corner square in the XY plane, facing +Z. */
  private static createStickerGeometry(): THREE.ShapeGeometry {
    const half = STICKER_SIZE / 2;
    const r = STICKER_RADIUS;
    const shape = new THREE.Shape();
    shape.moveTo(-half + r, -half);
    shape.lineTo(half - r, -half);
    shape.quadraticCurveTo(half, -half, half, -half + r);
    shape.lineTo(half, half - r);
    shape.quadraticCurveTo(half, half, half - r, half);
    shape.lineTo(-half + r, half);
    shape.quadraticCurveTo(-half, half, -half, half - r);
    shape.lineTo(-half, -half + r);
    shape.quadraticCurveTo(-half, -half, -half + r, -half);
    return new THREE.ShapeGeometry(shape, 6);
  }

  /** Release GPU resources. Call once when the scene is torn down. */
  public dispose(): void {
    if (this.pivot) this.releaseSlice(0);
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.pickables.length = 0;
    this.cubies.length = 0;
  }

  // -------------------------------------------------------------------------
  // Slice rotation - the pivot-group workflow
  // -------------------------------------------------------------------------

  /**
   * Step 1 + 2 of the pivot trick: select the slice on `axis`/`layer` and
   * re-parent its 9 cubies under a fresh pivot group at the origin.
   *
   * @param axisName which lattice axis defines the slice ('x' -> R/L, ...)
   * @param layer    the cubie coordinate along that axis (-1 | 0 | 1)
   * @param axisSign +1 or -1 direction of the rotation axis (right-hand rule)
   */
  public grabSlice(
    axisName: PrincipalAxisName,
    layer: number,
    axisSign: 1 | -1 = 1,
  ): void {
    if (this.pivot) return; // never grab two slices at once

    const slice = this.cubies.filter(
      (cubie) => Math.round(cubie.grid[axisName]) === layer,
    );

    const pivot = new THREE.Group();
    pivot.name = "slicePivot";
    this.root.add(pivot);
    for (const cubie of slice) pivot.attach(cubie.group);

    this.pivot = pivot;
    this.activeSlice = slice;
    this.activeAxisName = axisName;
    this.activeLayer = (Math.max(-1, Math.min(1, layer)) || 0) as -1 | 0 | 1;
    this.activeAxisVector.set(0, 0, 0);
    this.activeAxisVector[axisName] = axisSign;
  }

  /**
   * Step 3: rotate the grabbed slice live to `angle` radians around the
   * active axis. Called every pointermove / animation tick.
   */
  public rotateSliceTo(angle: number): void {
    this.pivot?.setRotationFromAxisAngle(this.activeAxisVector, angle);
  }

  /**
   * Step 4 + 5: finish a turn. The pivot is first rotated to EXACTLY
   * `quarterTurns * 90 deg`, then every cubie is re-attached into the root,
   * its lattice coordinate is updated with the same rotation, and its
   * transform is snapped to kill float drift. Passing 0 cancels a drag.
   */
  public releaseSlice(quarterTurns: number): { quarterTurns: QuarterTurns } {
    const pivot = this.pivot;
    if (!pivot) return { quarterTurns: 0 };

    const angle = quarterTurns * HALF_PI;
    pivot.setRotationFromAxisAngle(this.activeAxisVector, angle);
    pivot.updateMatrixWorld(true);

    // The logical rotation that matches the visual one, applied to grid data.
    const commit = new THREE.Matrix4().makeRotationAxis(
      this.activeAxisVector,
      angle,
    );

    for (const cubie of this.activeSlice) {
      // Re-parent back into the root while preserving the world transform.
      this.root.attach(cubie.group);

      cubie.grid.applyMatrix4(commit);
      snapToLattice(cubie.grid);

      // Snap visual transform onto the exact lattice. The quaternion is a
      // pure 90-degree-multiple rotation at this point, so rounding its
      // matrix elements is mathematically safe (see snapQuaternion).
      cubie.group.position.set(
        cubie.grid.x * CUBIE_SPACING,
        cubie.grid.y * CUBIE_SPACING,
        cubie.grid.z * CUBIE_SPACING,
      );
      snapQuaternion(cubie.group.quaternion);
      cubie.group.scale.set(1, 1, 1);
      cubie.group.updateMatrix();
    }

    this.root.remove(pivot);
    pivot.clear();
    this.pivot = null;
    this.activeSlice = [];

    const normalized = ((quarterTurns % 4) + 4) % 4; // 0..3
    const result =
      normalized === 3 ? -1 : (normalized as 0 | 1 | 2); // -1 == three quarters
    return { quarterTurns: result as QuarterTurns };
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * The cube is solved when, for each of the 6 world directions, every
   * sticker pointing that way shows the same color. Sticker normals are
   * rotated out of cubie-local space with the cubie's (axis-aligned) quaternion.
   */
  public isSolved(): boolean {
    const faces = new Map<string, Set<FaceColorIndex>>();
    for (const cubie of this.cubies) {
      for (const sticker of cubie.stickers) {
        const worldNormal = snapToPrincipalAxis(
          sticker.localNormal.clone().applyQuaternion(cubie.group.quaternion),
        );
        const key = `${worldNormal.x},${worldNormal.y},${worldNormal.z}`;
        const bucket = faces.get(key) ?? new Set<FaceColorIndex>();
        bucket.add(sticker.colorIndex);
        if (bucket.size > 1) return false; // early exit
        faces.set(key, bucket);
      }
    }
    return true;
  }

  /** Restore the pristine solved cube instantly (grid + transforms). */
  public reset(): void {
    if (this.pivot) this.releaseSlice(0);
    for (const cubie of this.cubies) {
      cubie.grid.copy(cubie.initialGrid);
      cubie.group.position.set(
        cubie.initialGrid.x * CUBIE_SPACING,
        cubie.initialGrid.y * CUBIE_SPACING,
        cubie.initialGrid.z * CUBIE_SPACING,
      );
      cubie.group.quaternion.identity();
      cubie.group.scale.set(1, 1, 1);
      cubie.group.updateMatrix();
    }
  }

  // -------------------------------------------------------------------------
  // Scramble support
  // -------------------------------------------------------------------------

  /** Pick a random move that does not immediately undo the previous one. */
  public static randomMove(previous?: SliceMove): SliceMove {
    const axes: PrincipalAxisName[] = ["x", "y", "z"];
    const layers: Array<-1 | 0 | 1> = [-1, 0, 1];
    const turns = [1, -1, 1, -1, 2]; // mostly quarter turns, occasional flip

    let axis = axes[Math.floor(Math.random() * axes.length)];
    let layer = layers[Math.floor(Math.random() * layers.length)];
    let guard = 0;
    while (
      previous &&
      previous.axis === axis &&
      previous.layer === layer &&
      guard < 8
    ) {
      axis = axes[Math.floor(Math.random() * axes.length)];
      layer = layers[Math.floor(Math.random() * layers.length)];
      guard += 1;
    }
    return {
      axis,
      layer,
      quarterTurns: turns[Math.floor(Math.random() * turns.length)],
    };
  }

  /** Expose the active slice description (handy for debugging overlays). */
  public get activeMoveDescription(): string {
    if (!this.pivot) return "idle";
    return `${this.activeAxisName}${this.activeLayer}`;
  }
}

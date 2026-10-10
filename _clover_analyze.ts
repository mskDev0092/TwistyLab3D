import * as THREE from "three";
import {
  CloverPyramidLogic,
  generateCloverScramble,
  FACE_NORMALS,
  VERTICES,
} from "./src/lib/cloverPyramid";

function analyze(label: string, logic: CloverPyramidLogic) {
  const pieces = logic.pieces.filter((p) => p.kind !== "center");
  // pairwise min angular distance (overlap detection)
  let minPair = Math.PI;
  let overlapCount = 0;
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const a = Math.acos(THREE.MathUtils.clamp(pieces[i].dir.dot(pieces[j].dir), -1, 1));
      if (a < minPair) minPair = a;
      if (a < THREE.MathUtils.degToRad(9)) overlapCount += 1;
    }
  }
  // tilt: angle between piece orientation +Z and the nearest face normal
  let maxTilt = 0;
  const faceCount: Record<number, number> = {};
  for (const p of pieces) {
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat);
    let best = Math.PI;
    for (const n of FACE_NORMALS) best = Math.min(best, Math.acos(THREE.MathUtils.clamp(z.dot(n), -1, 1)));
    maxTilt = Math.max(maxTilt, best);
    const f = logic.surfaceFace(p.dir);
    faceCount[f] = (faceCount[f] ?? 0) + 1;
  }
  console.log(label);
  console.log("  min pair angle(deg):", THREE.MathUtils.radToDeg(minPair), "overlaps(<9deg):", overlapCount);
  console.log("  max piece tilt(deg):", THREE.MathUtils.radToDeg(maxTilt));
  console.log("  pieces per face:", faceCount);
}

const logic = new CloverPyramidLogic();
analyze("SOLVED", logic);

const scramble = generateCloverScramble(22);
for (const m of scramble) logic.applyMove(m);
analyze("AFTER SCRAMBLE", logic);

// distribution of scrambled states across 200 scrambles (are they all different / scattered?)
const sigs = new Set<string>();
let solvedHit = 0;
for (let t = 0; t < 200; t += 1) {
  const l = new CloverPyramidLogic();
  const seq = generateCloverScramble(22);
  for (const m of seq) l.applyMove(m);
  if (l.isSolved()) solvedHit += 1;
  const sig = l.pieces
    .filter((p) => p.kind !== "center")
    .map((p) => `${l.surfaceFace(p.dir)}:${Math.round(p.dir.x * 20)},${Math.round(p.dir.y * 20)},${Math.round(p.dir.z * 20)}`)
    .join("|");
  sigs.add(sig);
}
console.log("unique scramble signatures over 200:", sigs.size, "solved-after-scramble:", solvedHit);

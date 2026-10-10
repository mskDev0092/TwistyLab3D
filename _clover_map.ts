import * as THREE from "three";
import { CloverPyramidLogic, VERTICES, FACE_NORMALS } from "./src/lib/cloverPyramid";

const logic = new CloverPyramidLogic();
const homes = logic.pieces.map((p) => ({ id: p.id, kind: p.kind, dir: p.homeDir.clone() }));

for (const angleDeg of [60, 120, 180, 240, 300]) {
  const l = new CloverPyramidLogic();
  l.applyMove({ disk: 0, steps: angleDeg / 60 });
  console.log(`\n=== disk 0, ${angleDeg}deg ===`);
  let missing = 0;
  for (const p of l.pieces) {
    let best = Infinity;
    let bestHome = -1;
    let bestKind = "";
    for (const h of homes) {
      const d = THREE.MathUtils.radToDeg(
        Math.acos(THREE.MathUtils.clamp(p.dir.dot(h.dir), -1, 1)),
      );
      if (d < best) {
        best = d;
        bestHome = h.id;
        bestKind = h.kind;
      }
    }
    if (best > 1) {
      missing += 1;
      // which face/vertex is it near?
      let cf = -1, cfv = -Infinity, cv = -1, cvv = -Infinity;
      FACE_NORMALS.forEach((n, i) => { const d = n.dot(p.dir); if (d > cfv) { cfv = d; cf = i; } });
      VERTICES.forEach((v, i) => { const d = v.dot(p.dir); if (d > cvv) { cvv = d; cv = i; } });
      console.log(
        `  ${p.kind}#${p.id} -> off-home by ${best.toFixed(1)}deg (nearest face ${cf}, nearest vertex ${cv}, vAngle ${THREE.MathUtils.radToDeg(Math.acos(Math.min(1,cvv))).toFixed(1)})`,
      );
    }
  }
  console.log(`  pieces NOT matching a home slot: ${missing} / ${l.pieces.length}`);
}

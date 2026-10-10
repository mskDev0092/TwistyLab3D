"use client";

/**
 * CloverPyramidCanvas
 * ===================
 * Browser-only Three.js renderer for the "Clover Pyramid" jumbling puzzle.
 * Like {@link RubiksCubeCanvas} it is loaded through `next/dynamic` with
 * `{ ssr: false }`, so `window`/`document` always exist. All GPU resources are
 * created in one `useEffect` and torn down in its cleanup.
 *
 * Interaction
 * -----------
 * - Pointer down on empty space -> OrbitControls orbits the camera.
 * - Pointer down on the solid   -> we pick the nearest corner disk and take
 *   over: the pointer is projected onto the plane perpendicular to that
 *   corner's axis and its polar angle drives the disk rotation 1:1.
 * - On release the disk snaps to the nearest 60-degree detent and commits.
 *   Even detents (120 deg) are the clean turns; odd detents (60 deg) are the
 *   jumbling turns that leave pieces tilted and shared edges in play.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Home, PartyPopper, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";

import CloverInfoPanel from "@/components/CloverInfoPanel";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  CIRCUMRADIUS,
  CloverPyramidLogic,
  DETENT,
  DISK_CUT_ANGLE,
  VERTICES,
  generateCloverScramble,
  type CloverMove,
} from "@/lib/cloverPyramid";
import {
  cloverMoveToken,
  parseCloverMoveSequence,
} from "@/lib/cloverNotation";

/* ------------------------------- tuning ---------------------------------- */

const CAMERA_FOV = 38;
const CAMERA_POSITION = new THREE.Vector3(4.8, 4.0, 5.6);
const SNAP_DURATION_MS = 180;
const SCRAMBLE_MOVE_MS = 185;
const RUN_MOVE_MS = 210;
const SCRAMBLE_MOVES = 22;
const HISTORY_LIMIT = 60;
const PIECE_LIFT = 0.015;

/* -------------------------------- types ---------------------------------- */

interface TweenTask {
  from: number;
  to: number;
  duration: number;
  start: number;
  ease: (t: number) => number;
  onUpdate: (value: number) => void;
  resolve: () => void;
}

interface DiskDrag {
  disk: number;
  angle: number;
  angle0: number;
  e1: THREE.Vector3;
  e2: THREE.Vector3;
}

/* ------------------------------- helpers --------------------------------- */

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function runTween(
  list: TweenTask[],
  from: number,
  to: number,
  duration: number,
  ease: (t: number) => number,
  onUpdate: (value: number) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    list.push({
      from,
      to,
      duration,
      start: performance.now(),
      ease,
      onUpdate,
      resolve,
    });
  });
}

/** Orthonormal basis perpendicular to `axis`. */
function perpBasis(axis: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const ref =
    Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(axis, ref).normalize();
  const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
  return [e1, e2];
}

/** Signed [-pi, pi] representation of an angle. */
function wrapPi(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/* ---------------------------- piece shapes -------------------------------- */

/** A rounded "clover leaf" pointing along +Y. */
function leafShape(halfWidth: number, halfHeight: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, -halfHeight);
  shape.quadraticCurveTo(halfWidth, 0, 0, halfHeight);
  shape.quadraticCurveTo(-halfWidth, 0, 0, -halfHeight);
  return shape;
}

function circleShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return shape;
}

function extrude(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.026,
    bevelSegments: 3,
    curveSegments: 16,
  });
  geometry.computeBoundingBox();
  // Sit the piece ON the surface: local z spans [0, height].
  geometry.translate(0, 0, -(geometry.boundingBox?.min.z ?? 0));
  return geometry;
}

/* ------------------------------ component -------------------------------- */

export default function CloverPyramidCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const logicRef = useRef<CloverPyramidLogic | null>(null);
  const dragRef = useRef<DiskDrag | null>(null);
  const tweensRef = useRef<TweenTask[]>([]);
  const movesRef = useRef(0);
  const busyRef = useRef(false);
  const scrambledRef = useRef(false);
  const disposedRef = useRef(false);
  const historyRef = useRef<string[]>([]);

  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [stateCode, setStateCode] = useState("");
  const [runProgress, setRunProgress] = useState<{
    current: number;
    total: number;
    token: string;
  } | null>(null);
  const [verify, setVerify] = useState<{ match: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const appendHistory = useCallback((tokens: string[]): void => {
    const list = historyRef.current;
    list.push(...tokens);
    if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);
    setHistory([...list]);
  }, []);

  /** Re-read solved/slot state from the logic into React state. */
  const refreshState = useCallback((): void => {
    const logic = logicRef.current;
    if (!logic) return;
    setStateCode(logic.getStateCode());
    setSolved(logic.isSolved());
    setMoves(movesRef.current);
  }, []);

  /** One animated, self-committing disk turn. */
  const playMove = useCallback(
    async (move: CloverMove, duration: number): Promise<void> => {
      const logic = logicRef.current;
      if (!logic || move.disk < 0 || move.steps === 0) return;
      logic.beginTurn(move.disk);
      await runTween(
        tweensRef.current,
        0,
        move.steps * DETENT,
        duration,
        easeInOutQuad,
        (value) => logic.setTurnAngle(value),
      );
      if (disposedRef.current) return;
      logic.endTurn(move.steps);
    },
    [],
  );

  const handleScramble = useCallback(async () => {
    const logic = logicRef.current;
    if (!logic || busyRef.current || logic.isGrabbed) return;
    busyRef.current = true;
    setBusy(true);
    setVerify(null);
    scrambledRef.current = true;
    movesRef.current = 0;
    historyRef.current = [];
    setMoves(0);
    setHistory([]);

    const sequence = generateCloverScramble(SCRAMBLE_MOVES);
    for (const move of sequence) {
      appendHistory([CloverPyramidLogic.moveToken(move)]);
      await playMove(move, SCRAMBLE_MOVE_MS);
      if (disposedRef.current) return;
    }
    busyRef.current = false;
    setBusy(false);
    refreshState();
  }, [appendHistory, playMove, refreshState]);

  const handleReset = useCallback(() => {
    const logic = logicRef.current;
    if (!logic || busyRef.current || logic.isGrabbed) return;
    logic.reset();
    movesRef.current = 0;
    historyRef.current = [];
    setMoves(0);
    setHistory([]);
    scrambledRef.current = false;
    setVerify(null);
    refreshState();
  }, [refreshState]);

  /** Execute an external move sequence (AI paste / window API) with animation. */
  const runMoves = useCallback(
    async (sequence: CloverMove[], predictedState?: string): Promise<void> => {
      const logic = logicRef.current;
      if (!logic || busyRef.current || logic.isGrabbed || sequence.length === 0) return;
      busyRef.current = true;
      setBusy(true);
      setVerify(null);

      const total = sequence.length;
      for (let i = 0; i < total; i += 1) {
        const move = sequence[i];
        const token = cloverMoveToken(move);
        setRunProgress({ current: i + 1, total, token });
        await playMove(move, RUN_MOVE_MS);
        if (disposedRef.current) return;
        movesRef.current += Math.abs(move.steps);
        appendHistory([CloverPyramidLogic.moveToken(move)]);
      }

      setRunProgress(null);
      busyRef.current = false;
      setBusy(false);

      if (disposedRef.current) return;
      const after = logic.getStateCode();
      setStateCode(after);
      const nowSolved = logic.isSolved();
      setSolved(nowSolved);
      if (!nowSolved) scrambledRef.current = true;
      else if (scrambledRef.current) {
        scrambledRef.current = false;
        toast.success(`Pyramid solved in ${movesRef.current} turns!`, {
          description: "Every petal found its face. Scramble again to keep going.",
        });
      }
      if (predictedState) setVerify({ match: predictedState === after });
    },
    [appendHistory, playMove],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    disposedRef.current = false;

    /* ------------------------- renderer ------------------------- */
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      void Promise.resolve().then(() =>
        setError(
          "WebGL is not available in this browser, so the 3D puzzle cannot be displayed.",
        ),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    container.appendChild(canvas);

    /* --------------------- scene & camera ----------------------- */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    camera.position.copy(CAMERA_POSITION);

    const logic = new CloverPyramidLogic();
    logicRef.current = logic;
    scene.add(logic.root);

    /* ----------------------- controls --------------------------- */
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 14;
    controls.rotateSpeed = 0.85;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.1;
    controls.target.set(0, 0, 0);

    /* ------------------------ lighting -------------------------- */
    const ambient = new THREE.AmbientLight(0xffffff, 0.95);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(6, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
    fillLight.position.set(-7, 3, -6);
    scene.add(ambient, keyLight, fillLight);

    /* -------------------- shadow catcher ------------------------ */
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.7;
    ground.receiveShadow = true;
    scene.add(ground);

    /* ----------------------- tetra body ------------------------- */
    const bodyPositions: number[] = [];
    const faces = [
      [0, 1, 2],
      [0, 1, 3],
      [0, 2, 3],
      [1, 2, 3],
    ];
    for (const [a, b, c] of faces) {
      const va = VERTICES[a].clone().multiplyScalar(CIRCUMRADIUS);
      const vb = VERTICES[b].clone().multiplyScalar(CIRCUMRADIUS);
      const vc = VERTICES[c].clone().multiplyScalar(CIRCUMRADIUS);
      const normal = new THREE.Vector3()
        .subVectors(vb, va)
        .cross(new THREE.Vector3().subVectors(vc, va));
      const centroid = new THREE.Vector3().addVectors(va, vb).add(vc);
      const flip = normal.dot(centroid) < 0;
      const tri = flip ? [va, vc, vb] : [va, vb, vc];
      for (const v of tri) bodyPositions.push(v.x, v.y, v.z);
    }
    const bodyGeometry = new THREE.BufferGeometry();
    bodyGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(bodyPositions, 3),
    );
    bodyGeometry.computeVertexNormals();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x10131b,
      roughness: 0.55,
      metalness: 0.15,
      flatShading: true,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    logic.root.add(body);

    // Crisp edges along the tetrahedron.
    const edgeGeometry = new THREE.EdgesGeometry(bodyGeometry, 1);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x8fa0b8,
      transparent: true,
      opacity: 0.45,
    });
    logic.root.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

    /* ------------------ circular "clover" cuts ------------------ */
    const cutGeometries: THREE.BufferGeometry[] = [];
    const cutMaterials: THREE.LineBasicMaterial[] = [];
    for (let i = 0; i < 4; i += 1) {
      const [e1, e2] = perpBasis(VERTICES[i]);
      const points: THREE.Vector3[] = [];
      const steps = 96;
      for (let s = 0; s < steps; s += 1) {
        const phi = (s / steps) * Math.PI * 2;
        const dir = VERTICES[i]
          .clone()
          .multiplyScalar(Math.cos(DISK_CUT_ANGLE));
        dir.addScaledVector(e1, Math.sin(DISK_CUT_ANGLE) * Math.cos(phi));
        dir.addScaledVector(e2, Math.sin(DISK_CUT_ANGLE) * Math.sin(phi));
        points.push(logic.surfacePoint(dir.normalize(), 0.006));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      cutGeometries.push(geometry);
      const material = new THREE.LineBasicMaterial({
        color: 0xc7d2e2,
        transparent: true,
        opacity: 0.5,
      });
      cutMaterials.push(material);
      logic.root.add(new THREE.LineLoop(geometry, material));
    }

    /* ------------------------ pieces ---------------------------- */
    const petalGeometry = extrude(leafShape(0.27, 0.33), 0.07);
    const edgeGeometryPiece = extrude(leafShape(0.22, 0.26), 0.07);
    const centerGeometry = extrude(circleShape(0.16), 0.06);
    const pieceMaterials: THREE.MeshStandardMaterial[] = [];
    const pieceMeshes: THREE.Mesh[] = logic.pieces.map((piece) => {
      const geometry =
        piece.kind === "petal"
          ? petalGeometry
          : piece.kind === "edge"
            ? edgeGeometryPiece
            : centerGeometry;
      const material = new THREE.MeshStandardMaterial({
        color: piece.color,
        roughness: 0.36,
        metalness: 0.12,
        emissive: new THREE.Color(piece.color).multiplyScalar(0.06),
      });
      pieceMaterials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      logic.root.add(mesh);
      return mesh;
    });

    const syncMeshes = (): void => {
      logic.pieces.forEach((piece, index) => {
        const mesh = pieceMeshes[index];
        mesh.position.copy(logic.surfacePoint(piece.dir, PIECE_LIFT));
        mesh.quaternion.copy(piece.quat);
      });
    };
    syncMeshes();

    /* ------------------- picking / dragging --------------------- */
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

    const setPointerFromEvent = (event: PointerEvent): void => {
      const rect = container.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.target !== canvas) return;
      controls.autoRotate = false;
      if (busyRef.current || tweensRef.current.length > 0) return;

      setPointerFromEvent(event);
      const hit = raycaster.intersectObjects([body, ...pieceMeshes], false)[0];
      if (!hit) return; // empty space -> OrbitControls keeps the gesture

      const dir = hit.point.clone().normalize();
      const disk = logic.nearestDisk(dir);
      if (disk < 0) return;

      const axis = VERTICES[disk];
      const [e1, e2] = perpBasis(axis);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        axis,
        new THREE.Vector3(0, 0, 0),
      );
      const projected = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, projected) === null) return;

      controls.enabled = false;
      canvas.style.cursor = "grabbing";
      logic.beginTurn(disk);
      dragRef.current = {
        disk,
        angle: 0,
        angle0: Math.atan2(projected.dot(e2), projected.dot(e1)),
        e1,
        e2,
      };
    };

    const onPointerMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      setPointerFromEvent(event);

      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        VERTICES[drag.disk],
        new THREE.Vector3(0, 0, 0),
      );
      const projected = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, projected) === null) return;

      const current = Math.atan2(projected.dot(drag.e2), projected.dot(drag.e1));
      const angle = THREE.MathUtils.clamp(wrapPi(current - drag.angle0), -Math.PI, Math.PI);
      drag.angle = angle;
      logic.setTurnAngle(angle);
    };

    const onPointerUp = (): void => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      controls.enabled = true;
      canvas.style.cursor = "grab";

      const snapped = Math.round(drag.angle / DETENT);
      if (snapped === 0) {
        logic.cancelTurn();
        return;
      }

      // Animate the leftover travel to the exact detent, then commit.
      void runTween(
        tweensRef.current,
        drag.angle,
        snapped * DETENT,
        SNAP_DURATION_MS,
        easeOutCubic,
        (value) => logic.setTurnAngle(value),
      ).then(() => {
        if (disposedRef.current) return;
        const move = logic.endTurn(snapped);
        const nextMoves = movesRef.current + Math.abs(snapped);
        movesRef.current = nextMoves;
        setMoves(nextMoves);
        appendHistory([CloverPyramidLogic.moveToken(move)]);
        setStateCode(logic.getStateCode());

        const nowSolved = logic.isSolved();
        setSolved(nowSolved);
        if (nowSolved && scrambledRef.current) {
          scrambledRef.current = false;
          toast.success(`Pyramid solved in ${nextMoves} moves!`, {
            description: "Every petal found its face. Scramble again to keep going.",
          });
        } else if (!nowSolved) {
          scrambledRef.current = true;
        }
      });
    };

    container.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    /* ------------------- resize & render loop ------------------- */
    const resize = (): void => {
      const width = container.clientWidth;
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.zoom = Math.min(1, 1.36 * camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const stepTweens = (now: number): void => {
      const tasks = tweensRef.current;
      for (let i = tasks.length - 1; i >= 0; i -= 1) {
        const task = tasks[i];
        const progress = Math.min(
          1,
          (now - task.start) / Math.max(1, task.duration),
        );
        task.onUpdate(task.from + (task.to - task.from) * task.ease(progress));
        if (progress >= 1) {
          tasks.splice(i, 1);
          task.resolve();
        }
      }
    };

    let frameId = 0;
    const tick = (now: number): void => {
      frameId = requestAnimationFrame(tick);
      stepTweens(now);
      controls.update();
      syncMeshes();
      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(tick);
    requestAnimationFrame(() => {
      setReady(true);
      setStateCode(logic.getStateCode());
      setSolved(logic.isSolved());
    });

    /* ----------------------- strict cleanup --------------------- */
    return () => {
      disposedRef.current = true;
      cancelAnimationFrame(frameId);
      tweensRef.current.length = 0;
      observer.disconnect();
      container.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      controls.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      cutGeometries.forEach((geometry) => geometry.dispose());
      cutMaterials.forEach((material) => material.dispose());
      petalGeometry.dispose();
      edgeGeometryPiece.dispose();
      centerGeometry.dispose();
      pieceMaterials.forEach((material) => material.dispose());
      groundGeometry.dispose();
      groundMaterial.dispose();
      scene.clear();
      renderer.dispose();
      canvas.remove();
      logicRef.current = null;
      dragRef.current = null;
    };
  }, [appendHistory]);

  /* --------------------- bot / agent window API --------------------- */
  useEffect(() => {
    const api = {
      getState: () => logicRef.current?.getStateCode() ?? "",
      isSolved: () => logicRef.current?.isSolved() ?? true,
      getMoves: () => movesRef.current,
      getHistory: () => historyRef.current.slice(),
      scramble: () => handleScramble(),
      reset: () => handleReset(),
      applyMoves: (tokens: string | string[]) => {
        const text = Array.isArray(tokens) ? `MOVES: ${tokens.join(" ")}` : tokens;
        const parsed = parseCloverMoveSequence(text);
        void runMoves(parsed.moves);
        return { parsed: parsed.tokens, ignored: parsed.ignored };
      },
      help: () =>
        [
          "Clover Pyramid remote-play API",
          "  getState()            -> 18-char slot code (petals face-major, then edges)",
          "  isSolved() / getMoves() / getHistory()",
          "  scramble() / reset()",
          "  applyMoves(\"A B' C2\")  -> runs the tokens on the real puzzle",
          "Notation: X = 60deg, X' = -60deg, X2 = 120deg, X3 = 180deg; X in A B C D.",
        ].join("\n"),
    };
    (window as unknown as Record<string, unknown>).CloverPyramidAPI = api;
    return () => {
      delete (window as unknown as Record<string, unknown>).CloverPyramidAPI;
    };
  }, [handleScramble, handleReset, runMoves]);

  /* --------------------------- HUD ---------------------------- */
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-neutral-950 text-white lg:flex-row-reverse">
      {/* ========================= 3D puzzle (right) ========================= */}
      <section
        id="puzzle-section"
        className="relative min-h-0 min-w-0 w-full flex-1 basis-[52dvh] overflow-hidden bg-[radial-gradient(ellipse_at_center,#241a2e_0%,#120f1c_58%,#06050a_100%)] lg:basis-auto"
      >
        <div
          ref={containerRef}
          role="application"
          aria-label="Interactive 3D Clover Pyramid jumbling puzzle. Drag near a corner to twist its clover disk, drag the background to orbit the camera."
          className={`absolute inset-0 touch-none transition-opacity duration-700 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-4">
          <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
            <h1 className="flex items-center gap-2 text-xs font-semibold tracking-tight text-white sm:text-sm">
              Clover Pyramid
              <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-fuchsia-200">
                Expert
              </span>
            </h1>
            <p className="mt-0.5 hidden text-[11px] leading-snug text-white/55 sm:block">
              Drag near a corner to twist &middot; drag empty space to orbit
              &middot; scroll to zoom
            </p>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/"
              aria-label="Back to all puzzles"
              className="flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-medium text-white/85 backdrop-blur-md transition-colors hover:bg-white/20 sm:h-10"
            >
              <Home className="size-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <div
              aria-live="polite"
              className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-black/45 px-3 py-2 text-xs font-medium text-white/85 backdrop-blur-md"
            >
              Turns: {moves}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleScramble()}
              disabled={busy}
              className="h-9 min-w-[5rem] border-white/15 bg-white/10 px-3 text-white backdrop-blur-md hover:bg-white/20 hover:text-white sm:h-10"
            >
              <Shuffle className="size-4" /> Scramble
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={busy}
              className="h-9 min-w-[4.5rem] border-white/15 bg-white/10 px-3 text-white backdrop-blur-md hover:bg-white/20 hover:text-white sm:h-10"
            >
              <RotateCcw className="size-4" /> Reset
            </Button>
          </div>
        </div>

        {/* Solved celebration */}
        {solved && moves > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4 sm:top-20">
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25">
              <PartyPopper className="size-4" aria-hidden />
              Solved in {moves} turns!
            </div>
          </div>
        )}

        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[10px] text-white/35 sm:text-[11px]">
          Drag near a corner to twist its clover disk · drag empty space to orbit
        </p>

        {error && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="max-w-sm rounded-2xl border border-red-500/30 bg-black/70 p-6 text-center backdrop-blur-md">
              <p className="text-sm font-semibold text-red-300">
                3D rendering unavailable
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/70">{error}</p>
            </div>
          </div>
        )}
      </section>

      {/* ===================== info panel (left) ===================== */}
      <aside
        id="info-panel"
        aria-label="Clover Pyramid mechanics and legend"
        className="flex min-h-0 w-full flex-1 flex-col border-t border-white/10 bg-neutral-950 lg:h-dvh lg:w-[26rem] lg:flex-none lg:border-r lg:border-t-0 xl:w-[28rem]"
      >
        <CloverInfoPanel
          moveCount={moves}
          isSolved={solved}
          busy={busy}
          history={history}
          stateCode={stateCode}
          runProgress={runProgress}
          verify={verify}
          onRunMoves={runMoves}
        />
      </aside>

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

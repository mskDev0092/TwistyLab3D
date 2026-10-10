"use client";

/**
 * RubiksCubeCanvas
 * ================
 * The ONLY place where Three.js touches the DOM. This component is never
 * server-rendered: `RubiksCubeWrapper` loads it through `next/dynamic` with
 * `{ ssr: false }`, so `window` / `document` are guaranteed to exist.
 *
 * Everything (renderer, scene, camera, controls, event listeners, animation
 * frames) is created inside a single `useEffect` and destroyed in its cleanup
 * function, which makes hot-reloading and route changes leak-free.
 *
 * Interaction model
 * -----------------
 * - Pointer down on the BACKGROUND -> OrbitControls orbits the camera.
 * - Pointer down on a CUBIE        -> we take over the gesture:
 *     1. Raycast to find the cubie + the exact face that was clicked.
 *     2. Build a fixed "drag plane" through the hit point, perpendicular to
 *        the face normal. Every pointer position is projected onto this
 *        plane, which turns 2D mouse movement into stable 3D movement.
 *     3. Once the pointer moves past a small threshold, the drag direction is
 *        snapped to the nearest principal axis lying in the face plane. The
 *        rotation axis is `faceNormal x dragDir` - for perpendicular principal
 *        axes the cross product is exactly the third principal axis, so no
 *        error can creep in.
 *     4. The 9-cubie slice around that axis is re-parented under a temporary
 *        pivot group (see RubiksCubeLogic) and follows the pointer 1:1.
 *     5. On release the angle snaps to the nearest multiple of 90 deg with a
 *        short tween, then the logical grid state is committed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PartyPopper, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  Cubie,
  HALF_PI,
  RubiksCubeLogic,
  SliceMove,
  dominantAxis,
  snapToPrincipalAxis,
} from "@/lib/RubiksCubeLogic";

/* ------------------------------- tuning ---------------------------------- */

const CAMERA_FOV = 36;
const CAMERA_POSITION = new THREE.Vector3(5.4, 4.8, 6.4);
/** World-space pointer travel before a drag commits to a rotation axis. */
const LOCK_THRESHOLD = 0.1;
/** World units of pointer travel that correspond to a 90-degree turn. */
const DRAG_QUARTER_DISTANCE = 2;
const SNAP_DURATION_MS = 170;
const SCRAMBLE_MOVES = 24;
const SCRAMBLE_MOVE_MS = 115;

/* -------------------------------- types ---------------------------------- */

/** Everything needed to turn an in-progress pointer drag into a slice turn. */
interface DragContext {
  cubie: Cubie;
  /** Hit point on the cube; origin of the drag vector. */
  startPoint: THREE.Vector3;
  /** Plane through the hit point, perpendicular to the face normal. */
  plane: THREE.Plane;
  /** Snapped world-space face normal at pointer-down. */
  worldNormal: THREE.Vector3;
  /** True once the rotation axis has been chosen. */
  locked: boolean;
  /** Unit principal axis (in the face plane) the pointer is dragging along. */
  dragDir: THREE.Vector3 | null;
  /** Current slice angle in radians. */
  angle: number;
}

interface TweenTask {
  from: number;
  to: number;
  duration: number;
  start: number;
  ease: (t: number) => number;
  onUpdate: (value: number) => void;
  resolve: () => void;
}

/* ------------------------------- helpers --------------------------------- */

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** Push a numeric tween onto `list`; the RAF loop advances and resolves it. */
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

/** The two unit principal axes perpendicular to a snapped face normal. */
function tangentAxes(normal: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  if (normal.x !== 0) {
    return [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  }
  if (normal.y !== 0) {
    return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  }
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
}

/* ------------------------------ component -------------------------------- */

export default function RubiksCubeCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const logicRef = useRef<RubiksCubeLogic | null>(null);
  const dragRef = useRef<DragContext | null>(null);
  const tweensRef = useRef<TweenTask[]>([]);
  const movesRef = useRef(0);
  const busyRef = useRef(false);
  const scrambledRef = useRef(false);
  const disposedRef = useRef(false);

  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /** One animated, self-committing slice turn (used by the scramble queue). */
  const animateMove = useCallback(
    async (move: SliceMove, duration: number): Promise<void> => {
      const logic = logicRef.current;
      if (!logic) return;
      logic.grabSlice(move.axis, move.layer, 1);
      await runTween(
        tweensRef.current,
        0,
        move.quarterTurns * HALF_PI,
        duration,
        easeInOutQuad,
        (value) => logic.rotateSliceTo(value),
      );
      if (disposedRef.current) return;
      logic.releaseSlice(move.quarterTurns);
    },
    [],
  );

  const handleScramble = useCallback(async () => {
    const logic = logicRef.current;
    if (!logic || busyRef.current || logic.isSliceGrabbed) return;
    busyRef.current = true;
    setBusy(true);
    setSolved(false);
    scrambledRef.current = true;
    movesRef.current = 0;
    setMoves(0);

    let previous: SliceMove | undefined;
    for (let i = 0; i < SCRAMBLE_MOVES; i += 1) {
      const move = RubiksCubeLogic.randomMove(previous);
      previous = move;
      await animateMove(move, SCRAMBLE_MOVE_MS);
      if (disposedRef.current) return;
    }
    busyRef.current = false;
    setBusy(false);
  }, [animateMove]);

  const handleReset = useCallback(() => {
    const logic = logicRef.current;
    if (!logic || busyRef.current || logic.isSliceGrabbed) return;
    logic.reset();
    movesRef.current = 0;
    setMoves(0);
    scrambledRef.current = false;
    setSolved(false);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    disposedRef.current = false;

    /* ------------------------- renderer ------------------------- */
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // Deferred to a microtask: React forbids synchronous setState inside an
      // effect body (react-hooks/set-state-in-effect).
      void Promise.resolve().then(() => {
        setError(
          "WebGL is not available in this browser, so the 3D cube cannot be displayed.",
        );
      });
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
    renderer.shadowMap.enabled = true;
    // NOTE: PCFSoftShadowMap was removed in recent three.js versions;
    // PCFShadowMap is the supported soft-quality option in r18x.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0); // transparent - CSS gradient shows through
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

    /* --------------------- cube (pure logic) -------------------- */
    const logic = new RubiksCubeLogic();
    logicRef.current = logic;
    scene.add(logic.root);

    /* ----------------------- controls --------------------------- */
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 16;
    controls.rotateSpeed = 0.85;
    controls.autoRotate = true; // gentle idle spin until the first click
    controls.autoRotateSpeed = 1.1;
    controls.target.set(0, 0, 0);

    /* ------------------------ lighting -------------------------- */
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(6, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -7;
    keyLight.shadow.camera.right = 7;
    keyLight.shadow.camera.top = 7;
    keyLight.shadow.camera.bottom = -7;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
    fillLight.position.set(-7, 3, -6);
    scene.add(ambient, keyLight, fillLight);

    /* -------------------- shadow catcher ------------------------ */
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -HALF_PI;
    ground.position.y = -3.1;
    ground.receiveShadow = true;
    scene.add(ground);

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

    /** Raycast against every cubie body + sticker. */
    const pickCubie = (
      event: PointerEvent,
    ): { cubie: Cubie; point: THREE.Vector3; worldNormal: THREE.Vector3 } | null => {
      setPointerFromEvent(event);
      const hit = raycaster.intersectObjects(logic.pickables, false)[0];
      if (!hit || !hit.face) return null;
      const userData = hit.object.userData as {
        cubie?: Cubie;
        localNormal?: THREE.Vector3;
      };
      const cubie = userData.cubie;
      if (!cubie) return null;

      // Stickers know their exact outward normal; for hits on the black
      // plastic body we derive it from the triangle normal instead.
      const worldNormal = snapToPrincipalAxis(
        userData.localNormal
          ? userData.localNormal
              .clone()
              .applyQuaternion(cubie.group.quaternion)
          : hit.face.normal.clone().transformDirection(hit.object.matrixWorld),
      );
      return { cubie, point: hit.point.clone(), worldNormal };
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.target !== canvas) return; // HUD clicks never reach the cube
      controls.autoRotate = false;
      // Never start a new slice while the previous snap tween is settling,
      // otherwise two pivots would fight over the same cubies.
      if (busyRef.current || tweensRef.current.length > 0) return;

      const hit = pickCubie(event);
      if (!hit) return; // background -> OrbitControls keeps the gesture

      controls.enabled = false; // freeze camera orbit for this gesture
      canvas.style.cursor = "grabbing";
      dragRef.current = {
        cubie: hit.cubie,
        startPoint: hit.point,
        plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
          hit.worldNormal,
          hit.point,
        ),
        worldNormal: hit.worldNormal,
        locked: false,
        dragDir: null,
        angle: 0,
      };
    };

    const onPointerMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      setPointerFromEvent(event);

      const current = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(drag.plane, current) === null) return;
      const dragVector = current.sub(drag.startPoint);

      if (!drag.locked) {
        if (dragVector.length() < LOCK_THRESHOLD) return;

        // Choose the in-plane principal axis that best matches the pointer
        // movement, signed so it points the way the pointer travels.
        const [t1, t2] = tangentAxes(drag.worldNormal);
        const t = Math.abs(dragVector.dot(t1)) >= Math.abs(dragVector.dot(t2)) ? t1 : t2;
        const dragDir = t.clone().multiplyScalar(Math.sign(dragVector.dot(t)) || 1);

        // axis = faceNormal x dragDir. Both are perpendicular principal axes,
        // so the result is EXACTLY +/- the third principal axis.
        const axisVector = new THREE.Vector3().crossVectors(drag.worldNormal, dragDir);
        const { axis, sign } = dominantAxis(axisVector);
        const layer = Math.round(drag.cubie.grid[axis]) as -1 | 0 | 1;

        logic.grabSlice(axis, layer, sign);
        drag.locked = true;
        drag.dragDir = dragDir;
      }

      if (!drag.dragDir) return;
      const angle = THREE.MathUtils.clamp(
        dragVector.dot(drag.dragDir) * (HALF_PI / DRAG_QUARTER_DISTANCE),
        -Math.PI,
        Math.PI,
      );
      drag.angle = angle;
      logic.rotateSliceTo(angle);
    };

    const onPointerUp = (): void => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      controls.enabled = true;
      canvas.style.cursor = "grab";
      if (!drag.locked || !drag.dragDir) return; // plain click, no twist

      // Snap the slice to the nearest quarter-turn and commit it.
      const snappedTurns = Math.round(drag.angle / HALF_PI);
      const target = snappedTurns * HALF_PI;
      void runTween(
        tweensRef.current,
        drag.angle,
        target,
        SNAP_DURATION_MS,
        easeOutCubic,
        (value) => logic.rotateSliceTo(value),
      ).then(() => {
        if (disposedRef.current) return;
        logic.releaseSlice(snappedTurns);
        if (snappedTurns === 0) return;

        const nextMoves = movesRef.current + Math.abs(snappedTurns);
        movesRef.current = nextMoves;
        setMoves(nextMoves);

        const nowSolved = logic.isSolved();
        setSolved(nowSolved);
        if (nowSolved && scrambledRef.current) {
          scrambledRef.current = false;
          toast.success(`Cube solved in ${nextMoves} moves!`, {
            description: "Scramble again to keep the challenge going.",
          });
        }
      });
    };

    // Capture phase on the container: runs BEFORE OrbitControls' own
    // pointerdown handler on the canvas, so we can disable orbiting first.
    container.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    /* ------------------- resize & render loop ------------------- */
    const resize = (): void => {
      const width = container.clientWidth;
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      // Portrait / narrow screens: zoom out proportionally so the whole cube
      // still fits horizontally (OrbitControls dollies the POSITION, so this
      // zoom factor never fights with the user's scroll / pinch zoom).
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
      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(tick);
    // Fade the canvas in once rendering has actually started (async callback,
    // so React never gets a synchronous setState from the effect body).
    requestAnimationFrame(() => setReady(true));

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
      logic.dispose(); // frees cube geometries/materials, detaches the root
      groundGeometry.dispose();
      groundMaterial.dispose();
      scene.clear();
      renderer.dispose(); // frees the WebGL context and its GPU programs
      canvas.remove(); // detaches the <canvas> from the DOM
      logicRef.current = null;
      dragRef.current = null;
    };
  }, []);

  /* --------------------------- HUD ---------------------------- */

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-neutral-950 bg-[radial-gradient(ellipse_at_center,#1d2233_0%,#0b0d13_58%,#05060a_100%)]">
      {/* Three.js mounts its <canvas> into this div */}
      <div
        ref={containerRef}
        role="application"
        aria-label="Interactive 3D Rubik's Cube. Drag a face to twist it, drag the background to orbit the camera."
        className={`absolute inset-0 touch-none transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-3 sm:p-5">
        <div className="pointer-events-auto max-w-[16rem] rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-md sm:max-w-none">
          <h1 className="text-sm font-semibold tracking-tight text-white sm:text-base">
            Rubik&apos;s Cube{" "}
            <span className="ml-1 align-middle text-[10px] font-normal uppercase tracking-[0.2em] text-white/40">
              vanilla three.js
            </span>
          </h1>
          <p className="mt-1 text-[11px] leading-snug text-white/55 sm:text-xs">
            Drag a face to twist &middot; drag the background to orbit &middot;
            scroll to zoom
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div
            aria-live="polite"
            className="hidden rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-xs font-medium text-white/85 backdrop-blur-md sm:block"
          >
            Moves: {moves}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleScramble()}
            disabled={busy}
            className="h-10 min-w-[5.5rem] border-white/15 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
          >
            <Shuffle className="size-4" /> Scramble
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            disabled={busy}
            className="h-10 min-w-[5.5rem] border-white/15 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
          >
            <RotateCcw className="size-4" /> Reset
          </Button>
        </div>
      </div>

      {/* Solved celebration */}
      {solved && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25">
            <PartyPopper className="size-4" aria-hidden />
            Solved in {moves} moves!
          </div>
        </div>
      )}

      {/* WebGL unavailable */}
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

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

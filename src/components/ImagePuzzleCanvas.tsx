"use client";

/**
 * ImagePuzzleCanvas
 * =================
 * Browser-only Three.js renderer for the "Photo Jigsaw" puzzle: any picture
 * (built-in sample, upload, or dropped file) is cut into interlocking pieces —
 * squares, jigsaw knobs, hexagons or triangle mosaic — that start scrambled on
 * a board. All pieces share one board texture whose UVs are derived from each
 * piece's position, so the picture stays seamless whatever the shape.
 *
 * Drag one piece onto another (or tap two pieces) to swap them; arrange every
 * piece back into its home slot to solve the picture.
 *
 * Loaded through `next/dynamic { ssr: false }` (see ImagePuzzleWrapper), so
 * `window`/`document` always exist. All GPU resources are created in one
 * `useEffect` and torn down in its cleanup.
 *
 * Interaction
 * -----------
 * - Pointer down on a tile  -> we take over (capture phase, OrbitControls off):
 *   drag the tile around; on release it swaps with whatever tile is nearest.
 * - A tap (no movement) selects a tile; tapping a second tile swaps the two.
 * - Pointer down on empty space -> OrbitControls gently orbits the board.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Home, Loader2, PartyPopper, RotateCcw, Shuffle } from "lucide-react";
import { toast } from "sonner";

import ImagePuzzlePanel from "@/components/ImagePuzzlePanel";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  SHAPES,
  buildLayout,
  buildMasterCanvas,
  loadImage,
  makePreview,
  renderSample,
  scrambleOrder,
  type BoardLayout,
  type PieceCell,
  type PieceShape,
  type SampleId,
} from "@/lib/imagePuzzle";

/* ------------------------------- tuning ---------------------------------- */

const BOARD = 4; // world-units target edge length of the board
const PIECE_DEPTH = 0.08;
const MASTER_PX = 1024; // long-edge resolution of the shared board texture
const DRAG_Z = 0.6;
const HOVER_Z = 0.08;
const SELECT_Z = 0.16;
const CAMERA_FOV = 42;
const FIT_MARGIN = 1.18;

/* -------------------------------- types ---------------------------------- */

interface SourceImage {
  el: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
}

interface GridDims {
  cols: number;
  rows: number;
}

interface PieceRef {
  home: number;
  cell: number;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  target: THREE.Vector3;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  raycaster: THREE.Raycaster;
  group: THREE.Group;
  sideMaterial: THREE.MeshStandardMaterial;
  maxAniso: number;
  fit: () => void;
}

interface DragState {
  piece: PieceRef;
  startX: number;
  startY: number;
  offset: THREE.Vector2;
  moved: boolean;
}

/* --------------------------------- view ---------------------------------- */

/** Build a puzzle source from a built-in sample (client-only, uses canvas). */
function createSampleSource(id: SampleId): SourceImage {
  const canvas = renderSample(id, 1024);
  return { el: canvas, width: canvas.width, height: canvas.height };
}

/**
 * Extrude one piece from its board-space outline. UVs are derived from each
 * vertex's absolute board position so the single shared board texture lines up
 * perfectly across arbitrary shapes (the caps get the picture, the sides don't).
 */
function createPieceGeometry(
  cell: PieceCell,
  boardW: number,
  boardH: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  cell.points.forEach((p, i) => {
    const x = p.x - cell.center.x;
    const y = p.y - cell.center.y;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: PIECE_DEPTH,
    bevelEnabled: false,
  });
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const ax = cell.center.x + position.getX(i);
    const ay = cell.center.y + position.getY(i);
    uv[i * 2] = (ax + boardW / 2) / boardW;
    uv[i * 2 + 1] = (ay + boardH / 2) / boardH;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

const previewOf = (src: SourceImage): string =>
  makePreview({ source: src.el, width: src.width, height: src.height }, 256);

export default function ImagePuzzleCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<SceneRefs | null>(null);
  const piecesRef = useRef<PieceRef[]>([]);
  const layoutRef = useRef<BoardLayout | null>(null);
  const assetsRef = useRef<{
    texture: THREE.Texture;
    material: THREE.Material;
  } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const selectedRef = useRef<PieceRef | null>(null);
  const hoverRef = useRef<PieceRef | null>(null);
  const pointerRef = useRef(new THREE.Vector2());
  const readyRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moves, setMoves] = useState(0);
  const [placed, setPlaced] = useState(0);
  const [solved, setSolved] = useState(false);
  const [grid, setGrid] = useState<GridDims>({ cols: 4, rows: 4 });
  const [shape, setShape] = useState<PieceShape>("classic");
  // Default picture is created lazily (client-only) so no setState runs in an
  // effect just to seed the board.
  const [source, setSource] = useState<SourceImage | null>(() =>
    createSampleSource("sunset"),
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    previewOf(createSampleSource("sunset")),
  );
  const [activeSample, setActiveSample] = useState<SampleId | null>("sunset");
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  /* --------------------------- board helpers --------------------------- */

  const clearBoard = useCallback(() => {
    const three = threeRef.current;
    if (!three) return;
    for (const piece of piecesRef.current) {
      three.group.remove(piece.mesh);
      piece.geometry.dispose();
    }
    piecesRef.current = [];
    if (assetsRef.current) {
      assetsRef.current.texture.dispose();
      assetsRef.current.material.dispose();
      assetsRef.current = null;
    }
    dragRef.current = null;
    selectedRef.current = null;
    hoverRef.current = null;
  }, []);

  const refreshProgress = useCallback(() => {
    const total = piecesRef.current.length;
    const home = piecesRef.current.reduce(
      (n, piece) => (piece.cell === piece.home ? n + 1 : n),
      0,
    );
    setPlaced(home);
    setSolved(total > 0 && home === total);
  }, []);

  const updateTargets = useCallback(() => {
    const layout = layoutRef.current;
    if (!layout) return;
    for (const piece of piecesRef.current) {
      if (dragRef.current?.piece === piece) continue;
      const center = layout.cells[piece.cell].center;
      const z =
        selectedRef.current === piece
          ? SELECT_Z
          : hoverRef.current === piece
            ? HOVER_Z
            : 0;
      piece.target.set(center.x, center.y, z);
    }
  }, []);

  const swapToCell = useCallback(
    (piece: PieceRef, targetCell: number) => {
      if (piece.cell === targetCell) return;
      const other = piecesRef.current.find(
        (p) => p !== piece && p.cell === targetCell,
      );
      if (!other) {
        piece.cell = targetCell;
        updateTargets();
        return;
      }
      const tmp = piece.cell;
      piece.cell = other.cell;
      other.cell = tmp;
      setMoves((m) => m + 1);
      refreshProgress();
      updateTargets();
    },
    [refreshProgress, updateTargets],
  );

  const handleTap = useCallback(
    (piece: PieceRef) => {
      const selected = selectedRef.current;
      if (selected === piece) {
        selectedRef.current = null;
      } else if (selected) {
        swapToCell(piece, selected.cell);
        selectedRef.current = null;
      } else {
        selectedRef.current = piece;
      }
      updateTargets();
    },
    [swapToCell, updateTargets],
  );

  const buildBoard = useCallback(
    (src: SourceImage, dims: GridDims, shapeId: PieceShape) => {
      const three = threeRef.current;
      if (!three) return;
      clearBoard();

      const layout = buildLayout(shapeId, dims.cols, dims.rows, BOARD);
      layoutRef.current = layout;

      const master = buildMasterCanvas(
        { source: src.el, width: src.width, height: src.height },
        layout.width,
        layout.height,
        MASTER_PX,
      );
      const texture = new THREE.CanvasTexture(master);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = three.maxAniso;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.85,
        metalness: 0,
      });
      assetsRef.current = { texture, material };

      const order = scrambleOrder(layout.cells.length);

      for (let home = 0; home < layout.cells.length; home += 1) {
        const geometry = createPieceGeometry(
          layout.cells[home],
          layout.width,
          layout.height,
        );
        const mesh = new THREE.Mesh(geometry, [material, three.sideMaterial]);
        const start = layout.cells[order[home]].center;
        mesh.position.set(start.x, start.y, 0);
        three.group.add(mesh);
        piecesRef.current.push({
          home,
          cell: order[home],
          mesh,
          geometry,
          target: new THREE.Vector3(start.x, start.y, 0),
        });
      }

      setMoves(0);
      refreshProgress();
      updateTargets();
      three.fit();
    },
    [clearBoard, refreshProgress, updateTargets],
  );

  const handleShuffle = useCallback(() => {
    const layout = layoutRef.current;
    const pieces = piecesRef.current;
    if (!layout || pieces.length === 0) return;
    const order = scrambleOrder(pieces.length);
    pieces.forEach((piece, i) => {
      piece.cell = order[i];
    });
    selectedRef.current = null;
    hoverRef.current = null;
    setMoves(0);
    refreshProgress();
    updateTargets();
    toast.message("Shuffled — rebuild the picture!");
  }, [refreshProgress, updateTargets]);

  const handleReset = useCallback(() => {
    const pieces = piecesRef.current;
    if (pieces.length === 0) return;
    pieces.forEach((piece) => {
      piece.cell = piece.home;
    });
    selectedRef.current = null;
    hoverRef.current = null;
    setMoves(0);
    refreshProgress();
    updateTargets();
  }, [refreshProgress, updateTargets]);

  const handleSelectSample = useCallback((id: SampleId) => {
    const src = createSampleSource(id);
    setActiveSample(id);
    setSource(src);
    setPreviewUrl(previewOf(src));
  }, []);

  const handleSelectGrid = useCallback((cols: number, rows: number) => {
    setGrid({ cols, rows });
  }, []);

  const handleSelectShape = useCallback((next: PieceShape) => {
    setShape(next);
  }, []);

  const shapeLabel =
    SHAPES.find((preset) => preset.id === shape)?.label ?? "Classic";

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setUploading(true);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const src: SourceImage = {
        el: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      setActiveSample(null);
      setSource(src);
      setPreviewUrl(previewOf(src));
    } catch {
      toast.error("That image could not be loaded.");
    } finally {
      URL.revokeObjectURL(url);
      setUploading(false);
    }
  }, []);

  /* ---------------------------- one-time 3D ---------------------------- */

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // Deferred to a microtask: React forbids synchronous setState inside an
      // effect body (react-hooks/set-state-in-effect).
      void Promise.resolve().then(() =>
        setError("WebGL is not available in this browser."),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.classList.add("touch-none");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      (mount.clientWidth || 1) / (mount.clientHeight || 1),
      0.1,
      100,
    );
    const viewDir = new THREE.Vector3(0, 0.26, 1).normalize();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.6;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 1.98;
    controls.minAzimuthAngle = -0.7;
    controls.maxAzimuthAngle = 0.7;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1b2433, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.5, 3.5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x99b7ff, 0.5);
    rim.position.set(-4, -1, 3);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    const raycaster = new THREE.Raycaster();
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2f3a,
      roughness: 0.9,
      metalness: 0,
    });

    const fit = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      const layout = layoutRef.current;
      const span = Math.max(layout?.width ?? BOARD, layout?.height ?? BOARD);
      const vFov = (camera.fov * Math.PI) / 180;
      const distV = (span * FIT_MARGIN) / (2 * Math.tan(vFov / 2));
      const distH = distV / (w / h);
      const dist = Math.max(distV, distH);
      camera.position.copy(viewDir).multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.minDistance = dist * 0.7;
      controls.maxDistance = dist * 1.7;
      controls.update();
    };

    const sceneRefs: SceneRefs = {
      renderer,
      scene,
      camera,
      controls,
      raycaster,
      group,
      sideMaterial,
      maxAniso: renderer.capabilities.getMaxAnisotropy(),
      fit,
    };
    threeRef.current = sceneRefs;
    fit();

    /* ----- pointer interaction -------------------------------- */

    const raycastPiece = (): PieceRef | null => {
      if (piecesRef.current.length === 0) return null;
      raycaster.setFromCamera(pointerRef.current, camera);
      const hits = raycaster.intersectObjects(
        piecesRef.current.map((p) => p.mesh),
        false,
      );
      if (hits.length === 0) return null;
      return (
        piecesRef.current.find((p) => p.mesh === hits[0].object) ?? null
      );
    };

    const pointOnBoard = (): THREE.Vector3 | null => {
      raycaster.setFromCamera(pointerRef.current, camera);
      const out = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      return raycaster.ray.intersectPlane(plane, out) ? out : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }
      pointerRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const piece = raycastPiece();
      if (!piece) {
        if (selectedRef.current) {
          selectedRef.current = null;
          updateTargets();
        }
        return; // let OrbitControls orbit
      }
      event.stopPropagation();
      event.preventDefault();
      controls.enabled = false;
      const hit = pointOnBoard();
      const offset = hit
        ? new THREE.Vector2(
            piece.mesh.position.x - hit.x,
            piece.mesh.position.y - hit.y,
          )
        : new THREE.Vector2();
      dragRef.current = {
        piece,
        startX: event.clientX,
        startY: event.clientY,
        offset,
        moved: false,
      };
      piece.mesh.position.z = DRAG_Z;
      piece.target.copy(piece.mesh.position);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        if (
          !drag.moved &&
          Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4
        ) {
          drag.moved = true;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        pointerRef.current.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const hit = pointOnBoard();
        if (hit) {
          const x = hit.x + drag.offset.x;
          const y = hit.y + drag.offset.y;
          drag.piece.mesh.position.set(x, y, DRAG_Z);
          drag.piece.target.set(x, y, DRAG_Z);
        }
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        if (hoverRef.current) {
          hoverRef.current = null;
          updateTargets();
        }
        return;
      }
      pointerRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const piece = raycastPiece();
      if (piece !== hoverRef.current) {
        hoverRef.current = piece;
        updateTargets();
      }
    };

    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      controls.enabled = true;
      const piece = drag.piece;

      if (!drag.moved) {
        handleTap(piece);
        return;
      }

      const layout = layoutRef.current;
      if (!layout || event.type === "pointercancel") return;
      const px = piece.mesh.position.x;
      const py = piece.mesh.position.y;
      let nearest = piece.cell;
      let best = Infinity;
      for (let i = 0; i < layout.cells.length; i += 1) {
        const c = layout.cells[i].center;
        const d = Math.hypot(px - c.x, py - c.y);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (best <= layout.spacing) swapToCell(piece, nearest);
      hoverRef.current = null;
      updateTargets();
    };

    const onPointerUp = (event: PointerEvent) => finishDrag(event);

    mount.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fit();
    });
    resizeObserver.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.1);
      const ease = 1 - Math.exp(-16 * dt);
      for (const piece of piecesRef.current) {
        piece.mesh.position.lerp(piece.target, ease);
      }
      controls.update();
      renderer.render(scene, camera);
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      mount.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      clearBoard();
      sideMaterial.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      threeRef.current = null;
    };
  }, [clearBoard, handleTap, swapToCell, updateTargets]);

  /* ------------------------- rebuild on changes ------------------------ */

  useEffect(() => {
    if (!source) return;
    buildBoard(source, grid, shape);
  }, [source, grid, shape, buildBoard]);

  /* ------------------------------- HUD ---------------------------------- */

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden bg-neutral-950 text-white lg:flex-row-reverse"
      onDragOver={(event) => {
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void handleUpload(file);
      }}
    >
      {/* ========================= 3D board (right) ========================= */}
      <section
        id="puzzle-section"
        className="relative min-h-0 min-w-0 w-full flex-1 basis-[52dvh] overflow-hidden bg-[radial-gradient(ellipse_at_center,#1e2233_0%,#0d1019_58%,#05060a_100%)] lg:basis-auto"
      >
        <div
          ref={mountRef}
          role="application"
          aria-label="Interactive 3D photo jigsaw board. Drag a tile onto another to swap them, drag the background to orbit the camera."
          className={`absolute inset-0 touch-none transition-opacity duration-700 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 sm:p-4">
          <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
            <h1 className="text-sm font-semibold tracking-tight text-white">
              Photo Jigsaw
              <span className="ml-1.5 text-[10px] font-normal uppercase tracking-[0.2em] text-white/40">
                vanilla three.js
              </span>
            </h1>
            <p className="mt-0.5 hidden text-[11px] leading-snug text-white/55 sm:block">
              Drag a tile onto another to swap · drag the background to orbit
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
              className="shrink-0 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/85 backdrop-blur-md"
            >
              {shapeLabel} · {placed}/{grid.cols * grid.rows} · swaps: {moves}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleShuffle}
              className="h-9 border-white/15 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white sm:h-10"
            >
              <Shuffle className="size-4" />
              <span className="hidden sm:inline">Shuffle</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              className="h-9 border-white/15 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white sm:h-10"
            >
              <RotateCcw className="size-4" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          </div>
        </div>

        {/* Solved celebration */}
        {solved && moves > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4 sm:top-20">
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25">
              <PartyPopper className="size-4" aria-hidden />
              Picture complete — {moves} swaps!
            </div>
          </div>
        )}

        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center text-[10px] text-white/35 sm:text-[11px]">
          Drag a tile onto another to swap · tap two tiles · drag the background to orbit
        </p>

        {/* Drop-a-file overlay */}
        {dropActive && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl border-2 border-dashed border-sky-400/70 bg-black/50 px-8 py-6 text-center">
              <p className="text-sm font-semibold text-white">Drop your image</p>
              <p className="mt-1 text-xs text-white/60">
                PNG · JPG · WebP · GIF
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {!ready && !error && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-white/70">
              <Loader2 className="size-8 animate-spin" aria-hidden />
              <p className="text-xs font-medium tracking-wide">
                Preparing your puzzle&hellip;
              </p>
            </div>
          </div>
        )}

        {/* WebGL failure */}
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
        aria-label="Photo Jigsaw controls"
        className="flex min-h-0 w-full flex-1 flex-col border-t border-white/10 bg-neutral-950 lg:h-dvh lg:w-[26rem] lg:flex-none lg:border-r lg:border-t-0 xl:w-[28rem]"
      >
        <ImagePuzzlePanel
          moveCount={moves}
          placed={placed}
          total={grid.cols * grid.rows}
          solved={solved}
          cols={grid.cols}
          rows={grid.rows}
          shape={shape}
          previewUrl={previewUrl}
          activeSample={activeSample}
          uploading={uploading}
          onSelectSample={handleSelectSample}
          onUpload={handleUpload}
          onSelectGrid={handleSelectGrid}
          onSelectShape={handleSelectShape}
        />
      </aside>

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

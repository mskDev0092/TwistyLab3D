"use client";

/**
 * ImagePuzzleCanvas
 * =================
 * Browser-only Three.js renderer for the "Photo Jigsaw" puzzle, styled as a
 * cosy craft table: any picture (built-in sample, upload, or dropped file) is
 * cut into interlocking pieces — squares, jigsaw knobs, hexagons or triangle
 * mosaic — then scattered across a soft pastel floor. All pieces share one
 * board texture whose UVs are derived from each piece's position, so the
 * picture stays seamless whatever the shape.
 *
 * Interaction
 * -----------
 * - Grab a piece and drag it anywhere on the floor (free placement, like a
 *   real puzzle). Drop it near its slot and it snaps home; drop it on another
 *   piece's slot and the two swap.
 * - A tap (no movement) selects a piece; tapping a second piece swaps the two.
 * - Drag the background to orbit the camera around the table.
 *
 * Loaded through `next/dynamic { ssr: false }` (see ImagePuzzleWrapper), so
 * `window`/`document` always exist. All GPU resources are created in one
 * `useEffect` and torn down in its cleanup.
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
  scatterPositions,
  type BoardLayout,
  type PieceCell,
  type PieceShape,
  type SampleId,
} from "@/lib/imagePuzzle";

/* ------------------------------- tuning ---------------------------------- */

const BOARD = 4; // world-units target edge length of the board
const PIECE_DEPTH = 0.08;
const MASTER_PX = 1024; // long-edge resolution of the shared board texture
const FLOOR_MULT = 2.3; // floor size relative to the board span
const DRAG_Z = 0.6;
const HOVER_Z = 0.08;
const SELECT_Z = 0.16;
const CAMERA_FOV = 42;
const FIT_MARGIN = 1.06;

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
  cell: number; // home slot index when snapped home; -1 when free on the floor
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  base: THREE.Vector3; // resting position on the floor (z = 0)
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

/** Cover-cropped square thumbnail data-URL for the panel's reference image. */
function previewOf(src: SourceImage): string {
  return makePreview({
    source: src.el as CanvasImageSource,
    width: src.width,
    height: src.height,
  });
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

/** A soft pastel craft-mat texture with a faded edge (so it reads as round). */
function makeFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  if (!ctx) return tex;

  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, "#f4ecff");
  base.addColorStop(0.45, "#eef2ff");
  base.addColorStop(1, "#e3fbf7");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Soft pastel blobs for a hand-made feel.
  const blobs: Array<[number, number, number, string]> = [
    [size * 0.24, size * 0.22, size * 0.34, "rgba(255,138,190,0.30)"],
    [size * 0.8, size * 0.28, size * 0.32, "rgba(120,180,255,0.30)"],
    [size * 0.68, size * 0.82, size * 0.36, "rgba(150,240,200,0.30)"],
    [size * 0.2, size * 0.8, size * 0.3, "rgba(255,214,140,0.28)"],
  ];
  for (const [cx, cy, r, color] of blobs) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // Faint dotted grid.
  ctx.fillStyle = "rgba(120,110,180,0.12)";
  const step = size / 20;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fade the edges so the mat blends into the dark room.
  const fade = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.34,
    size / 2,
    size / 2,
    size * 0.62,
  );
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(10,12,20,0.92)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Recursively dispose an object's geometries + materials/textures. */
function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const m of list) {
      const anyMat = m as THREE.Material & { map?: THREE.Texture | null };
      if (anyMat.map) anyMat.map.dispose();
      m.dispose();
    }
  });
}

/* --------------------------------- component ------------------------------ */

export default function ImagePuzzleCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef<PieceRef[]>([]);
  const layoutRef = useRef<BoardLayout | null>(null);
  const decorRef = useRef<THREE.Group | null>(null);
  const assetsRef = useRef<{
    texture: THREE.Texture;
    material: THREE.Material;
  } | null>(null);
  const seedRef = useRef(1);
  const threeRef = useRef<SceneRefs | null>(null);
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

  const floorSpan = useCallback((): number => {
    const layout = layoutRef.current;
    const span = Math.max(layout?.width ?? BOARD, layout?.height ?? BOARD);
    return span * FLOOR_MULT;
  }, []);

  const clearBoard = useCallback(() => {
    const three = threeRef.current;
    if (!three) return;
    for (const piece of piecesRef.current) {
      three.group.remove(piece.mesh);
      piece.geometry.dispose();
    }
    piecesRef.current = [];
    if (decorRef.current) {
      three.scene.remove(decorRef.current);
      disposeObject(decorRef.current);
      decorRef.current = null;
    }
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
    for (const piece of piecesRef.current) {
      if (dragRef.current?.piece === piece) continue;
      const z =
        selectedRef.current === piece
          ? SELECT_Z
          : hoverRef.current === piece
            ? HOVER_Z
            : 0;
      piece.target.set(piece.base.x, piece.base.y, z);
    }
  }, []);

  const scatterPieces = useCallback(() => {
    const pieces = piecesRef.current;
    if (pieces.length === 0) return;
    seedRef.current += 1;
    const spots = scatterPositions(pieces.length, floorSpan(), seedRef.current);
    pieces.forEach((piece, i) => {
      piece.cell = -1;
      piece.base.set(spots[i].x, spots[i].y, 0);
    });
    selectedRef.current = null;
    hoverRef.current = null;
    updateTargets();
  }, [floorSpan, updateTargets]);

  /** Move `piece` so it snaps into `targetCell`, swapping with any occupant. */
  const dropIntoCell = useCallback(
    (piece: PieceRef, targetCell: number) => {
      const layout = layoutRef.current;
      if (!layout) return false;
      const other = piecesRef.current.find(
        (p) => p !== piece && p.cell === targetCell,
      );
      const prevBase = piece.base.clone();
      const prevCell = piece.cell;
      if (other) {
        other.cell = prevCell;
        other.base.copy(prevBase);
      }
      piece.cell = targetCell;
      const center = layout.cells[targetCell].center;
      piece.base.set(center.x, center.y, 0);
      setMoves((m) => m + 1);
      refreshProgress();
      return true;
    },
    [refreshProgress],
  );

  const handleTap = useCallback(
    (piece: PieceRef) => {
      const selected = selectedRef.current;
      if (selected === piece) {
        selectedRef.current = null;
      } else if (selected) {
        const base = selected.base.clone();
        const cell = selected.cell;
        selected.base.copy(piece.base);
        selected.cell = piece.cell;
        piece.base.copy(base);
        piece.cell = cell;
        selectedRef.current = null;
        setMoves((m) => m + 1);
        refreshProgress();
      } else {
        selectedRef.current = piece;
      }
      updateTargets();
    },
    [refreshProgress, updateTargets],
  );

  const buildBoard = useCallback(
    (src: SourceImage, dims: GridDims, shapeId: PieceShape) => {
      const three = threeRef.current;
      if (!three) return;
      clearBoard();

      const layout = buildLayout(shapeId, dims.cols, dims.rows, BOARD);
      layoutRef.current = layout;
      const floor = floorSpan();

      // ----- room decor: the craft-table mat + faint home-slot ghosts -------
      const decor = new THREE.Group();
      const floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(floor, floor),
        new THREE.MeshBasicMaterial({
          map: makeFloorTexture(),
          transparent: true,
          depthWrite: false,
        }),
      );
      floorMesh.position.z = -0.014;
      decor.add(floorMesh);

      const ghostMaterial = new THREE.MeshBasicMaterial({
        color: 0x2b3044,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      });
      for (const cell of layout.cells) {
        const ghostShape = new THREE.Shape();
        cell.points.forEach((p, i) => {
          if (i === 0) ghostShape.moveTo(p.x, p.y);
          else ghostShape.lineTo(p.x, p.y);
        });
        ghostShape.closePath();
        const ghost = new THREE.Mesh(
          new THREE.ShapeGeometry(ghostShape),
          ghostMaterial,
        );
        ghost.position.z = -0.006;
        decor.add(ghost);
      }
      three.scene.add(decor);
      decorRef.current = decor;

      // ----- the picture ---------------------------------------------------
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
        roughness: 0.8,
        metalness: 0,
      });
      assetsRef.current = { texture, material };

      const spots = scatterPositions(layout.cells.length, floor, seedRef.current);
      for (let home = 0; home < layout.cells.length; home += 1) {
        const geometry = createPieceGeometry(
          layout.cells[home],
          layout.width,
          layout.height,
        );
        const mesh = new THREE.Mesh(geometry, [material, three.sideMaterial]);
        mesh.position.set(spots[home].x, spots[home].y, 0);
        three.group.add(mesh);
        piecesRef.current.push({
          home,
          cell: -1,
          mesh,
          geometry,
          base: new THREE.Vector3(spots[home].x, spots[home].y, 0),
          target: new THREE.Vector3(spots[home].x, spots[home].y, 0),
        });
      }

      setMoves(0);
      refreshProgress();
      updateTargets();
      three.fit();
    },
    [clearBoard, floorSpan, refreshProgress, updateTargets],
  );

  const handleShuffle = useCallback(() => {
    if (piecesRef.current.length === 0) return;
    scatterPieces();
    setMoves(0);
    refreshProgress();
    toast.message("Scattered — rebuild the picture!");
  }, [refreshProgress, scatterPieces]);

  const handleReset = useCallback(() => {
    const layout = layoutRef.current;
    const pieces = piecesRef.current;
    if (!layout || pieces.length === 0) return;
    pieces.forEach((piece) => {
      piece.cell = piece.home;
      const center = layout.cells[piece.home].center;
      piece.base.set(center.x, center.y, 0);
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
      200,
    );
    const viewDir = new THREE.Vector3(0, 0.24, 1).normalize();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.98;
    controls.minAzimuthAngle = -0.9;
    controls.maxAzimuthAngle = 0.9;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2b2f45, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2.5, 3.5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9db6ff, 0.5);
    rim.position.set(-4, -1, 3);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    const raycaster = new THREE.Raycaster();
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: 0xece4d2,
      roughness: 0.82,
      metalness: 0,
    });

    const fit = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      const span = floorSpan();
      const vFov = (camera.fov * Math.PI) / 180;
      const distV = (span * FIT_MARGIN) / (2 * Math.tan(vFov / 2));
      const distH = distV / (w / h);
      const dist = Math.max(distV, distH);
      camera.position.copy(viewDir).multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.minDistance = dist * 0.35;
      controls.maxDistance = dist * 1.25;
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

    const clampToFloor = (x: number, y: number): THREE.Vector2 => {
      const half = floorSpan() / 2 - 0.08;
      return new THREE.Vector2(
        Math.max(-half, Math.min(half, x)),
        Math.max(-half, Math.min(half, y)),
      );
    };

    const raycastPiece = (): PieceRef | null => {
      if (piecesRef.current.length === 0) return null;
      raycaster.setFromCamera(pointerRef.current, camera);
      const hits = raycaster.intersectObjects(
        piecesRef.current.map((p) => p.mesh),
        false,
      );
      if (hits.length === 0) return null;
      return piecesRef.current.find((p) => p.mesh === hits[0].object) ?? null;
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
          const spot = clampToFloor(
            hit.x + drag.offset.x,
            hit.y + drag.offset.y,
          );
          drag.piece.mesh.position.set(spot.x, spot.y, DRAG_Z);
          drag.piece.target.set(spot.x, spot.y, DRAG_Z);
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
      if (!layout || event.type === "pointercancel") {
        updateTargets();
        return;
      }
      const px = piece.mesh.position.x;
      const py = piece.mesh.position.y;
      let nearest = -1;
      let best = Infinity;
      for (let i = 0; i < layout.cells.length; i += 1) {
        const c = layout.cells[i].center;
        const d = Math.hypot(px - c.x, py - c.y);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (nearest >= 0 && best <= layout.spacing) {
        dropIntoCell(piece, nearest);
      } else {
        // Free drop: leave the piece where it landed, clamped to the mat.
        const clamped = clampToFloor(px, py);
        piece.cell = -1;
        piece.base.set(clamped.x, clamped.y, 0);
      }
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
  }, [
    clearBoard,
    dropIntoCell,
    floorSpan,
    handleTap,
    updateTargets,
  ]);

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
      {/* ========================= 3D table (right) ========================= */}
      <section
        id="puzzle-section"
        className="relative min-h-0 min-w-0 w-full flex-1 basis-[52dvh] overflow-hidden bg-[radial-gradient(ellipse_at_center,#2a2440_0%,#12121f_60%,#05060a_100%)] lg:basis-auto"
      >
        <div
          ref={mountRef}
          role="application"
          aria-label="Interactive 3D photo jigsaw table. Drag a piece around the floor to place it; drag the background to orbit the camera."
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
              Drag pieces around the table · drop them home to snap
            </p>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/"
              aria-label="Back to the puzzle room"
              className="flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 text-xs font-medium text-white/85 backdrop-blur-md transition-colors hover:bg-white/20 sm:h-10"
            >
              <Home className="size-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <div
              aria-live="polite"
              className="shrink-0 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs font-medium text-white/85 backdrop-blur-md"
            >
              {shapeLabel} · {placed}/{grid.cols * grid.rows} · moves: {moves}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleShuffle}
              className="h-9 border-white/15 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white sm:h-10"
            >
              <Shuffle className="size-4" />
              <span className="hidden sm:inline">Scatter</span>
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
              Picture complete — {moves} moves!
            </div>
          </div>
        )}

        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center text-[10px] text-white/35 sm:text-[11px]">
          Drag a piece anywhere (free placement) · drop near its slot to snap · tap two to swap
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

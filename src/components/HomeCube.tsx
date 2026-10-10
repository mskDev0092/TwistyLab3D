"use client";

/**
 * HomeCube
 * ========
 * The homepage: you stand inside a room built as a giant cube. Each of the six
 * inner walls carries a 3x3 menu of tiles (6 x 9 = 54). Drag to look around in
 * 360 degrees; click a tile to either open a puzzle route or pop an in-cube
 * information card. Framed by the same vanilla Three.js look as the games.
 *
 * Loaded through HomeCubeWrapper (`next/dynamic { ssr:false }`) so all browser
 * APIs exist. All GPU resources are created in one effect and disposed in its
 * cleanup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as THREE from "three";
import {
  BookOpen,
  Box,
  Camera,
  Clock,
  Code2,
  Compass,
  FileText,
  Gauge,
  Globe,
  Hand,
  Hexagon,
  Image as ImageIcon,
  Info,
  Keyboard,
  Layers,
  Lightbulb,
  List,
  Loader2,
  Magnet,
  Mail,
  MessageSquare,
  Music,
  Palette,
  Play,
  Puzzle,
  Pyramid,
  RotateCw,
  Scan,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Square,
  Star,
  Target,
  Triangle,
  Trophy,
  Users,
  X,
  Zap,
  Bot,
  type LucideIcon,
} from "lucide-react";

import {
  HOME_FACES,
  type MenuFace,
  type MenuTile,
  type TileIcon,
} from "@/lib/homeMenu";

/* ------------------------------- constants ------------------------------- */

const ROOM = 10;
const HALF = ROOM / 2;
const FOV = 72;
const GRID = ROOM * 0.72; // 7.2 - square area the 3x3 grid occupies on a wall
const CELL = GRID / 3; // 2.4
const TILE = CELL * 0.82; // 1.97
const TITLE_W = 6.2;
const TITLE_H = 1.55; // 4:1 to match the title texture
const TITLE_Y = 4.12;

const LOOK_SENS = 0.0045; // rad per px
const MAX_PITCH = THREE.MathUtils.degToRad(79);
const CLICK_SLOP = 6; // px of movement still treated as a click
const IDLE_DELAY = 6; // s before the view starts to drift
const IDLE_DRIFT = 0.05; // rad/s

/* -------------------------------- icon map ------------------------------- */

const ICONS: Record<TileIcon, LucideIcon> = {
  cube: Box,
  box: Box,
  pyramid: Pyramid,
  image: ImageIcon,
  square: Square,
  puzzle: Puzzle,
  hexagon: Hexagon,
  triangle: Triangle,
  book: BookOpen,
  code: Code2,
  shuffle: Shuffle,
  lightbulb: Lightbulb,
  robot: Bot,
  compass: Compass,
  gauge: Gauge,
  hand: Hand,
  magnet: Magnet,
  trophy: Trophy,
  layers: Layers,
  rotate: RotateCw,
  target: Target,
  zap: Zap,
  clock: Clock,
  list: List,
  play: Play,
  scan: Scan,
  message: MessageSquare,
  file: FileText,
  sparkles: Sparkles,
  info: Info,
  shield: ShieldCheck,
  globe: Globe,
  mail: Mail,
  camera: Camera,
  keyboard: Keyboard,
  palette: Palette,
  music: Music,
  users: Users,
  star: Star,
};

/* ----------------------------- face placement ---------------------------- */

interface FacePlacement {
  index: number; // index into HOME_FACES
  position: [number, number, number];
  rotation: [number, number, number]; // Euler XYZ so local +Z points inward
  look: { yaw: number; pitch: number };
}

// "Games" faces you on arrival. The right-hand column documents which Box face
// each entry sits on, for the wall-material array order below.
const PLACEMENTS: FacePlacement[] = [
  { index: 0, position: [0, 0, -HALF], rotation: [0, 0, 0], look: { yaw: 0, pitch: 0 } }, // games  → -Z
  { index: 1, position: [HALF, 0, 0], rotation: [0, -Math.PI / 2, 0], look: { yaw: -Math.PI / 2, pitch: 0 } }, // types → +X
  { index: 2, position: [0, 0, HALF], rotation: [0, Math.PI, 0], look: { yaw: Math.PI, pitch: 0 } }, // guides → +Z
  { index: 3, position: [-HALF, 0, 0], rotation: [0, Math.PI / 2, 0], look: { yaw: Math.PI / 2, pitch: 0 } }, // ai → -X
  { index: 4, position: [0, HALF, 0], rotation: [Math.PI / 2, 0, 0], look: { yaw: 0, pitch: MAX_PITCH } }, // about → +Y
  { index: 5, position: [0, -HALF, 0], rotation: [-Math.PI / 2, 0, 0], look: { yaw: 0, pitch: -MAX_PITCH } }, // extras → -Y
];

// BoxGeometry material slots are ordered [+X, -X, +Y, -Y, +Z, -Z].
const WALL_ORDER = [1, 3, 4, 5, 2, 0];

/* ------------------------------ canvas art ------------------------------- */

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** #rrggbb + alpha -> rgba(). */
function hexA(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The gradient + faint grid drawn on each inner wall. */
function makeWallTexture(face: MenuFace): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (!ctx) return tex;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, face.bg[0]);
  grad.addColorStop(1, face.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.1,
    size * 0.5,
    size * 0.5,
    size * 0.78,
  );
  glow.addColorStop(0, "rgba(255,255,255,0.08)");
  glow.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 2;
  const step = size / 20;
  for (let i = 0; i <= 20; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }

  return tex;
}

/** A single labelled menu tile: dark card, coloured accent bar, label + hint. */
function makeTileTexture(tile: MenuTile): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (!ctx) return tex;

  const base = ctx.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, "#181c30");
  base.addColorStop(1, "#0b0e1c");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const tint = ctx.createLinearGradient(0, size, 0, size * 0.3);
  tint.addColorStop(0, hexA(tile.tint[0], 0.5));
  tint.addColorStop(1, hexA(tile.tint[0], 0));
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);

  const bar = ctx.createLinearGradient(0, 0, size, 0);
  bar.addColorStop(0, tile.tint[0]);
  bar.addColorStop(1, tile.tint[1]);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, size, 26);

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  ctx.beginPath();
  ctx.arc(size / 2, size * 0.31, 42, 0, Math.PI * 2);
  ctx.fillStyle = hexA(tile.tint[1], 0.9);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.stroke();

  const lines = wrapLines(ctx, tile.label, size - 90);
  const fontSize = lines.length > 2 ? 50 : 64;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  const lineHeight = fontSize * 1.12;
  const startY = size * 0.56 - ((lines.length - 1) * lineHeight) / 2;
  lines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, size / 2, startY + i * lineHeight);
  });

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 30px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(tile.hint, size / 2, size * 0.83);

  return tex;
}

/** A wall title card (face name + tagline) on a transparent background. */
function makeTitleTexture(face: MenuFace): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (!ctx) return tex;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 108px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(face.name, w / 2, h * 0.38);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 44px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(face.tagline, w / 2, h * 0.72);
  return tex;
}

function disposeTree(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const m of list) {
      const mat = m as THREE.Material & { map?: THREE.Texture | null };
      if (mat.map) mat.map.dispose();
      m.dispose();
    }
  });
}

/* ------------------------------- component ------------------------------- */

export default function HomeCube() {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);

  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const targetYaw = useRef(0);
  const targetPitch = useRef(0);
  const pointer = useRef(new THREE.Vector2(0, 0));
  const hovering = useRef<THREE.Mesh | null>(null);
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
    moved: boolean;
  } | null>(null);
  const lastInteract = useRef(0);
  const lastFace = useRef(-1);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFace, setActiveFace] = useState(0);
  const [modal, setModal] = useState<MenuTile | null>(null);
  const [modalFaceName, setModalFaceName] = useState("");

  const gameLinks = useMemo(
    () => HOME_FACES[0].tiles.filter((t) => t.kind === "link"),
    [],
  );

  const openTile = useCallback(
    (tile: MenuTile, face: MenuFace) => {
      if (tile.kind === "link" && tile.href) {
        router.push(tile.href);
        return;
      }
      setModalFaceName(face.name);
      setModal(tile);
    },
    [router],
  );

  const lookAt = useCallback((yaw: number, pitch: number) => {
    targetYaw.current = yaw;
    targetPitch.current = THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH);
    lastInteract.current = performance.now() / 1000;
  }, []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  /* ------------------------------ 3D setup ----------------------------- */

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      void Promise.resolve().then(() =>
        setError("WebGL is not available in this browser."),
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      FOV,
      (mount.clientWidth || 1) / (mount.clientHeight || 1),
      0.1,
      100,
    );
    camera.rotation.order = "YXZ";
    camera.position.set(0, 0, 0);

    // Room shell: six inner walls, material order [px, nx, py, ny, pz, nz].
    const wallMaterials = WALL_ORDER.map(
      (i) =>
        new THREE.MeshBasicMaterial({
          map: makeWallTexture(HOME_FACES[i]),
          side: THREE.BackSide,
        }),
    );
    const room = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM, ROOM, ROOM),
      wallMaterials,
    );
    scene.add(room);

    // Tiles + titles.
    const tileMeshes: THREE.Mesh[] = [];
    const tileGroup = new THREE.Group();
    scene.add(tileGroup);

    for (const place of PLACEMENTS) {
      const face = HOME_FACES[place.index];
      const group = new THREE.Group();
      group.position.set(...place.position);
      group.rotation.set(...place.rotation);
      tileGroup.add(group);

      const title = new THREE.Mesh(
        new THREE.PlaneGeometry(TITLE_W, TITLE_H),
        new THREE.MeshBasicMaterial({
          map: makeTitleTexture(face),
          transparent: true,
        }),
      );
      title.position.set(0, TITLE_Y, 0.04);
      group.add(title);

      for (let i = 0; i < 9; i += 1) {
        const tile = face.tiles[i];
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE, TILE),
          new THREE.MeshBasicMaterial({ map: makeTileTexture(tile) }),
        );
        const col = i % 3;
        const row = Math.floor(i / 3);
        mesh.position.set((col - 1) * CELL, -(row - 1) * CELL, 0.05);
        mesh.userData = {
          faceIndex: place.index,
          tileIndex: i,
          targetScale: 1,
        };
        group.add(mesh);
        tileMeshes.push(mesh);
      }
    }

    const raycaster = new THREE.Raycaster();
    lastInteract.current = performance.now() / 1000;

    /* ------------------------------ picking ------------------------------ */

    const setPointer = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.current.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const inCanvas = (x: number, y: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const pick = (): THREE.Mesh | null => {
      raycaster.setFromCamera(pointer.current, camera);
      const hits = raycaster.intersectObjects(tileMeshes, false);
      return hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
    };

    const setHover = (mesh: THREE.Mesh | null) => {
      if (hovering.current === mesh) return;
      hovering.current = mesh;
      for (const m of tileMeshes) {
        m.userData.targetScale = m === mesh ? 1.08 : 1;
      }
    };

    const onMove = (event: PointerEvent) => {
      if (drag.current) {
        const dx = event.clientX - drag.current.startX;
        const dy = event.clientY - drag.current.startY;
        if (Math.hypot(dx, dy) > CLICK_SLOP) drag.current.moved = true;
        if (drag.current.moved) {
          targetYaw.current = drag.current.startYaw + dx * LOOK_SENS;
          targetPitch.current = THREE.MathUtils.clamp(
            drag.current.startPitch + dy * LOOK_SENS,
            -MAX_PITCH,
            MAX_PITCH,
          );
          lastInteract.current = performance.now() / 1000;
          setHover(null);
        }
        return;
      }
      if (!inCanvas(event.clientX, event.clientY)) {
        setHover(null);
        return;
      }
      setPointer(event.clientX, event.clientY);
      setHover(pick());
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!inCanvas(event.clientX, event.clientY)) return;
      setPointer(event.clientX, event.clientY);
      drag.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startYaw: targetYaw.current,
        startPitch: targetPitch.current,
        moved: false,
      };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };

    const onUp = (event: PointerEvent) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.id) return;
      drag.current = null;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      if (state.moved) return;
      if (!inCanvas(event.clientX, event.clientY)) return;
      setPointer(event.clientX, event.clientY);
      const mesh = pick();
      if (!mesh) return;
      const face = HOME_FACES[mesh.userData.faceIndex as number];
      const tile = face.tiles[mesh.userData.tileIndex as number];
      (mesh.userData.targetScale as number) = 1.08;
      openTile(tile, face);
    };

    const onLeave = () => setHover(null);

    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    /* ------------------------------- loop ------------------------------- */

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(mount);

    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const normals = PLACEMENTS.map((p) =>
      new THREE.Vector3(...p.position).normalize(),
    );
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.1);
      const now = performance.now() / 1000;

      if (!drag.current && now - lastInteract.current > IDLE_DELAY) {
        targetYaw.current += dt * IDLE_DRIFT;
      }

      const ease = 1 - Math.exp(-10 * dt);
      yawRef.current += (targetYaw.current - yawRef.current) * ease;
      pitchRef.current += (targetPitch.current - pitchRef.current) * ease;
      camera.rotation.set(pitchRef.current, yawRef.current, 0);

      for (const m of tileMeshes) {
        const target = m.userData.targetScale as number;
        m.scale.setScalar(m.scale.x + (target - m.scale.x) * ease);
      }

      camera.getWorldDirection(forward);
      let bestFace = 0;
      let bestDot = -Infinity;
      for (let i = 0; i < PLACEMENTS.length; i += 1) {
        const dot = forward.dot(normals[i]);
        if (dot > bestDot) {
          bestDot = dot;
          bestFace = PLACEMENTS[i].index;
        }
      }
      if (bestFace !== lastFace.current) {
        lastFace.current = bestFace;
        setActiveFace(bestFace);
      }

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
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      disposeTree(room);
      disposeTree(tileGroup);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [openTile]);

  const face = HOME_FACES[activeFace];

  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-[#05060c] text-white">
      <div
        ref={mountRef}
        role="application"
        aria-label="Interactive 3D room. Drag to look around; click a tile to open it."
        className={`absolute inset-0 touch-none transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]"
      />

      {/* SEO + no-JS fallback */}
      <noscript>
        <div className="absolute inset-0 z-20 grid place-items-center bg-neutral-950 p-8">
          <nav className="flex flex-col gap-3 text-center" aria-label="Puzzles">
            {gameLinks.map((tile) => (
              <a key={tile.href} href={tile.href} className="text-sky-300 underline">
                {tile.label}
              </a>
            ))}
          </nav>
        </div>
      </noscript>
      <nav className="sr-only" aria-label="Puzzle pages">
        {gameLinks.map((tile) => (
          <Link key={tile.href} href={tile.href ?? "/"}>
            {tile.label}
          </Link>
        ))}
      </nav>

      {/* ------------------------------ HUD ------------------------------ */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-md">
            <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-500">
                <Box className="size-3.5 text-white" />
              </span>
              Twisty Lab
            </h1>
            <p className="mt-0.5 text-[11px] text-white/55">
              You&apos;re inside the cube · look around in 360°
            </p>
          </div>

          <div
            className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-right backdrop-blur-md"
            aria-live="polite"
          >
            <p className={`text-[10px] uppercase tracking-[0.25em] ${face.accent}`}>
              wall
            </p>
            <p className="text-sm font-semibold">{face.name}</p>
            <p className="text-[11px] text-white/50">{face.tagline}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="pointer-events-none hidden text-[11px] text-white/45 sm:block">
            Drag to look · click a tile · 6 walls × 9 tiles
          </p>

          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/45 p-1.5 backdrop-blur-md">
            {HOME_FACES.map((f, index) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  const place = PLACEMENTS[index];
                  lookAt(place.look.yaw, place.look.pitch);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  index === activeFace
                    ? "bg-white text-neutral-900"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-white/70">
            <Loader2 className="size-7 animate-spin" aria-hidden />
            <p className="text-xs font-medium tracking-wide">
              Stepping inside&hellip;
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 grid place-items-center p-6">
          <div className="max-w-sm rounded-2xl border border-red-500/30 bg-black/70 p-6 text-center backdrop-blur-md">
            <p className="text-sm font-semibold text-red-300">
              3D rendering unavailable
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/70">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              {gameLinks.map((tile) => (
                <Link
                  key={tile.href}
                  href={tile.href ?? "/"}
                  className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/85 hover:bg-white/20"
                >
                  {tile.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------- modal ----------------------------- */}
      {modal && (
        <div
          className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={() => setModal(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.label}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-3xl border border-white/12 bg-neutral-950/95 shadow-2xl"
          >
            <div
              className="flex items-start justify-between gap-3 p-5"
              style={{
                background: `linear-gradient(135deg, ${hexA(
                  modal.tint[0],
                  0.28,
                )}, ${hexA(modal.tint[1], 0.12)})`,
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid size-10 place-items-center rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${modal.tint[0]}, ${modal.tint[1]})`,
                  }}
                >
                  {(() => {
                    const Icon = ICONS[modal.icon];
                    return <Icon className="size-5 text-white" />;
                  })()}
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-tight">
                    {modal.label}
                  </h2>
                  <p className="text-[11px] text-white/55">{modal.hint}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {modal.body && (
                <p className="text-sm leading-relaxed text-white/75">
                  {modal.body}
                </p>
              )}
              {modal.bullets && (
                <ul className="space-y-2">
                  {modal.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-[13px] leading-relaxed text-white/70"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full"
                        style={{ background: modal.tint[0] }}
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
              {modal.kind === "link" && modal.href && (
                <Link
                  href={modal.href}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-neutral-900 hover:bg-white/90"
                >
                  Open {modal.label}
                  <Play className="size-3.5" />
                </Link>
              )}
              {modalFaceName && (
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                  {modalFaceName} wall
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

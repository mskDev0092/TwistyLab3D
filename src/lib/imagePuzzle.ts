/**
 * imagePuzzle
 * ===========
 * Framework-free helpers for the "Photo Jigsaw" 3D puzzle: procedurally
 * generated sample images, cover-crop slicing into square tiles, and a
 * scramble permutation. Kept separate from the Three.js component so the pure
 * logic (slicing maths, scramble validity) can be unit-tested in isolation.
 */

/** A drawable source plus its intrinsic size. */
export interface ImageLike {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface GridPreset {
  label: string;
  hint: string;
  cols: number;
  rows: number;
}

export const DIFFICULTIES: GridPreset[] = [
  { label: "3 × 3", hint: "Breezy", cols: 3, rows: 3 },
  { label: "4 × 4", hint: "Classic", cols: 4, rows: 4 },
  { label: "5 × 5", hint: "Tricky", cols: 5, rows: 5 },
  { label: "6 × 6", hint: "Tough", cols: 6, rows: 6 },
];

/* ------------------------------ samples ---------------------------------- */

export type SampleId =
  | "aurora"
  | "sunset"
  | "lagoon"
  | "blossom"
  | "candy"
  | "slate";

export interface SampleDef {
  id: SampleId;
  name: string;
}

export const SAMPLES: SampleDef[] = [
  { id: "aurora", name: "Aurora" },
  { id: "sunset", name: "Sunset" },
  { id: "lagoon", name: "Lagoon" },
  { id: "blossom", name: "Blossom" },
  { id: "candy", name: "Candy" },
  { id: "slate", name: "Slate" },
];

/** Deterministic PRNG so a given sample always renders identically. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fillQuad(
  ctx: CanvasRenderingContext2D,
  size: number,
  stops: Array<[number, string]>,
  angle: "vertical" | "diagonal" = "vertical",
): void {
  const g =
    angle === "vertical"
      ? ctx.createLinearGradient(0, 0, 0, size)
      : ctx.createLinearGradient(0, 0, size, size);
  for (const [t, color] of stops) g.addColorStop(t, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

type Painter = (ctx: CanvasRenderingContext2D, size: number, rng: () => number) => void;

const painters: Record<SampleId, Painter> = {
  aurora: (ctx, size, rng) => {
    fillQuad(ctx, size, [
      [0, "#04060f"],
      [0.5, "#0b1330"],
      [1, "#05060f"],
    ]);
    // Stars.
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 240; i += 1) {
      ctx.globalAlpha = 0.25 + rng() * 0.7;
      const r = 0.4 + rng() * 1.3;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size * 0.8, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Colour curtains.
    const palette = ["#39e0a0", "#3ad6ff", "#a06bff", "#ff6bd6", "#5bffd0"];
    for (let i = 0; i < 5; i += 1) {
      const baseY = size * (0.18 + i * 0.15);
      const phase = rng() * Math.PI * 2;
      const amp = size * (0.03 + rng() * 0.05);
      const thick = size * (0.05 + rng() * 0.07);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = palette[i % palette.length];
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= size; x += 10) {
        ctx.lineTo(x, baseY + Math.sin((x / size) * Math.PI * 2 + phase) * amp);
      }
      for (let x = size; x >= 0; x -= 10) {
        ctx.lineTo(
          x,
          baseY + thick + Math.sin((x / size) * Math.PI * 2 + phase * 1.3) * amp,
        );
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  sunset: (ctx, size, rng) => {
    fillQuad(ctx, size, [
      [0, "#1b1035"],
      [0.42, "#7b2d5e"],
      [0.66, "#c9456b"],
      [0.82, "#f07a4a"],
      [1, "#ffcf7a"],
    ]);
    // Sun + halo.
    const sunY = size * 0.68;
    const halo = ctx.createRadialGradient(size / 2, sunY, 0, size / 2, sunY, size * 0.4);
    halo.addColorStop(0, "rgba(255,238,180,0.9)");
    halo.addColorStop(0.4, "rgba(255,190,110,0.35)");
    halo.addColorStop(1, "rgba(255,190,110,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#fff2c4";
    ctx.beginPath();
    ctx.arc(size / 2, sunY, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Cloud bands.
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 6; i += 1) {
      const y = size * (0.12 + rng() * 0.4);
      const w = size * (0.2 + rng() * 0.4);
      ctx.fillStyle = "rgba(255,220,220,0.6)";
      ctx.beginPath();
      ctx.ellipse(rng() * size, y, w, size * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Hills.
    ctx.fillStyle = "#2a1436";
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.quadraticCurveTo(size * 0.3, size * 0.72, size * 0.62, size * 0.86);
    ctx.quadraticCurveTo(size * 0.82, size * 0.94, size, size * 0.8);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#170a1f";
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.quadraticCurveTo(size * 0.4, size * 0.9, size * 0.7, size);
    ctx.closePath();
    ctx.fill();
  },

  lagoon: (ctx, size, rng) => {
    fillQuad(ctx, size, [
      [0, "#062a3f"],
      [0.4, "#0e6f8f"],
      [0.75, "#17b0a6"],
      [1, "#8ff0d8"],
    ]);
    // Sun glint.
    const glint = ctx.createRadialGradient(size * 0.72, size * 0.22, 0, size * 0.72, size * 0.22, size * 0.22);
    glint.addColorStop(0, "rgba(255,255,240,0.95)");
    glint.addColorStop(1, "rgba(255,255,240,0)");
    ctx.fillStyle = glint;
    ctx.fillRect(0, 0, size, size);
    // Waves.
    for (let i = 0; i < 12; i += 1) {
      const y = size * (0.3 + i * 0.06);
      const amp = size * (0.01 + rng() * 0.02);
      ctx.globalAlpha = 0.25 + rng() * 0.3;
      ctx.strokeStyle = "#eafffb";
      ctx.lineWidth = 1 + rng() * 2;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 3 + i) * amp);
      }
      ctx.stroke();
    }
    // Bubbles.
    for (let i = 0; i < 40; i += 1) {
      const r = 2 + rng() * 8;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rng() * size, size * (0.35 + rng() * 0.65), r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  blossom: (ctx, size, rng) => {
    fillQuad(ctx, size, [
      [0, "#2a0b1e"],
      [0.45, "#832b57"],
      [1, "#e58fb4"],
    ]);
    // Branches.
    ctx.strokeStyle = "#3a1526";
    ctx.lineCap = "round";
    for (let i = 0; i < 7; i += 1) {
      ctx.lineWidth = 2 + rng() * 6;
      ctx.beginPath();
      ctx.moveTo(size * (0.05 + rng() * 0.3), size);
      ctx.quadraticCurveTo(
        size * (0.2 + rng() * 0.5),
        size * (0.3 + rng() * 0.4),
        size * (0.3 + rng() * 0.7),
        size * (0.05 + rng() * 0.4),
      );
      ctx.stroke();
    }
    // Blossoms (5 petals).
    const petals = ["#ffffff", "#ffd5e6", "#ff9ec7", "#ffc2dd"];
    for (let i = 0; i < 90; i += 1) {
      const cx = rng() * size;
      const cy = rng() * size;
      const r = size * (0.008 + rng() * 0.014);
      ctx.fillStyle = petals[Math.floor(rng() * petals.length)];
      for (let p = 0; p < 5; p += 1) {
        const a = (p / 5) * Math.PI * 2 + rng();
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffe8a0";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  candy: (ctx, size, rng) => {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(Math.PI / 4);
    const stripe = size * 0.12;
    const colors = ["#ff5d8f", "#ffb84d", "#fff05d", "#5df2a0", "#5dc8ff", "#b46bff"];
    for (let i = -size; i < size; i += stripe) {
      ctx.fillStyle = colors[Math.abs(Math.round(i / stripe)) % colors.length];
      ctx.fillRect(i, -size, stripe, size * 3);
    }
    ctx.restore();
    // Polka dots.
    for (let i = 0; i < 90; i += 1) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, 4 + rng() * 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  slate: (ctx, size, rng) => {
    fillQuad(ctx, size, [
      [0, "#0e1116"],
      [0.5, "#3a4350"],
      [1, "#c7d0da"],
    ]);
    ctx.strokeStyle = "#f3f6fa";
    for (let i = 0; i < 26; i += 1) {
      ctx.globalAlpha = 0.1 + rng() * 0.35;
      ctx.lineWidth = 1 + rng() * 3;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, (i + 1) * (size * 0.03), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i % 2 ? "#ffffff" : "#0e1116";
      const s = size * (0.05 + rng() * 0.12);
      ctx.save();
      ctx.translate(rng() * size, rng() * size);
      ctx.rotate(rng() * Math.PI);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

/** Render a sample image to an offscreen square canvas. */
export function renderSample(id: SampleId, size = 768): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const seed = SAMPLES.findIndex((s) => s.id === id) + 1;
  painters[id](ctx, size, mulberry32(seed * 7919 + 13));
  return canvas;
}

/* ------------------------------- images ---------------------------------- */

/** Load a URL / object-URL / data-URL into an HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image could not be decoded."));
    img.src = src;
  });
}

/**
 * Draw `img` cover-cropped into a square `cols*tile × rows*tile` canvas, ready
 * to be sliced into perfectly aligned square tiles (no seams).
 */
export function buildMaster(
  img: ImageLike,
  cols: number,
  rows: number,
  tile = 160,
): HTMLCanvasElement {
  const w = cols * tile;
  const h = rows * tile;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#0b0d13";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img.source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas;
}

/** Extract the (r, c) tile of `master` as its own canvas. */
export function sliceTile(
  master: HTMLCanvasElement,
  c: number,
  r: number,
  cols: number,
  rows: number,
): HTMLCanvasElement {
  const tw = master.width / cols;
  const th = master.height / rows;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(tw);
  canvas.height = Math.round(th);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(master, c * tw, r * th, tw, th, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Small cover-cropped square preview data-URL for the reference thumbnail. */
export function makePreview(img: ImageLike, size = 256): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const scale = Math.max(size / img.width, size / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img.source, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png");
}

/* ------------------------------ scrambling -------------------------------- */

/**
 * A random permutation `order[homeIndex] = cellIndex`. Guaranteed not to be the
 * identity (which would be a solved board) and, for boards with enough pieces,
 * not to leave too many pieces already home.
 */
export function scrambleOrder(count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  const homeCount = (): number => order.reduce((n, cell, i) => (cell === i ? n + 1 : n), 0);
  let guard = 0;
  do {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    guard += 1;
  } while (guard < 50 && (homeCount() === count || (count >= 6 && homeCount() > 1)));
  return order;
}

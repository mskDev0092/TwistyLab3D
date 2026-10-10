/**
 * imagePuzzle
 * ===========
 * Framework-free helpers for the "Photo Jigsaw" 3D puzzle: procedurally
 * generated sample images, piece layouts for several board shapes (squares,
 * jigsaw, honeycomb, triangle mosaic), and a scramble permutation. Kept
 * separate from the Three.js component so the pure logic (layout maths,
 * scramble validity) can be unit-tested in isolation.
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

/* ------------------------------- shapes ---------------------------------- */

export type PieceShape = "classic" | "jigsaw" | "hexagon" | "triangle";

export interface ShapePreset {
  id: PieceShape;
  label: string;
  hint: string;
}

export const SHAPES: ShapePreset[] = [
  { id: "classic", label: "Classic", hint: "Squares" },
  { id: "jigsaw", label: "Jigsaw", hint: "Knobs" },
  { id: "hexagon", label: "Honeycomb", hint: "Hexagons" },
  { id: "triangle", label: "Mosaic", hint: "Triangles" },
];

/** A 2-D point, framework-free so layouts can be unit-tested without Three.js. */
export interface Vec2 {
  x: number;
  y: number;
}

/** One piece: its outline (board-space, y up) and its home centroid. */
export interface PieceCell {
  center: Vec2;
  points: Vec2[];
}

export interface BoardLayout {
  width: number;
  height: number;
  cells: PieceCell[];
  /** Nearest-cell drop radius: how close a drag must land to snap a swap. */
  spacing: number;
}

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
 * Draw `img` cover-cropped into one canvas whose aspect ratio matches the board
 * (`boardW : boardH`), capped at `maxPx` on the long edge. A single shared
 * texture keeps every piece's paint aligned no matter what shape it is.
 */
export function buildMasterCanvas(
  img: ImageLike,
  boardW: number,
  boardH: number,
  maxPx = 1024,
): HTMLCanvasElement {
  const aspect = boardW / boardH;
  const w = aspect >= 1 ? maxPx : Math.round(maxPx * aspect);
  const h = aspect >= 1 ? Math.round(maxPx / aspect) : maxPx;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#0b0d13";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(
    img.source,
    (canvas.width - dw) / 2,
    (canvas.height - dh) / 2,
    dw,
    dh,
  );
  return canvas;
}

/* ------------------------------ layouts ---------------------------------- */

/** Signed-area centroid; falls back to the vertex mean for degenerate rings. */
function polygonCentroid(points: Vec2[]): Vec2 {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    area += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-9) {
    const sum = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), {
      x: 0,
      y: 0,
    });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Force a ring into counter-clockwise order (Three.js front faces +Z). */
function ensureCCW(points: Vec2[]): Vec2[] {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area < 0 ? points.slice().reverse() : points;
}

/** Catmull-Rom through `controls`, sampling `perSegment` steps. */
function catmullRom(controls: Vec2[], perSegment: number): Vec2[] {
  if (controls.length < 2) return controls.slice();
  const out: Vec2[] = [];
  for (let i = 0; i < controls.length - 1; i += 1) {
    const p0 = controls[i - 1] ?? controls[i];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[i + 2] ?? controls[i + 1];
    for (let s = 0; s < perSegment; s += 1) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(controls[controls.length - 1]);
  return out;
}

/** Classic square grid: `cols × rows` unit cells. */
function squareCells(cols: number, rows: number): Vec2[][] {
  const cells: Vec2[][] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push([
        { x: c, y: r },
        { x: c + 1, y: r },
        { x: c + 1, y: r + 1 },
        { x: c, y: r + 1 },
      ]);
    }
  }
  return cells;
}

/** Heading for a jigsaw tab (fraction of edge length). */
const TAB_CONTROLS: Vec2[] = [
  { x: 0, y: 0 },
  { x: 0.18, y: -0.06 },
  { x: 0.34, y: 0.26 },
  { x: 0.5, y: 0.3 },
  { x: 0.66, y: 0.26 },
  { x: 0.82, y: -0.06 },
  { x: 1, y: 0 },
];
const TAB_SCALE = 0.58;

/**
 * Jigsaw: square cells whose internal edges carry an interlocking knob. Shared
 * edges are generated once and cached, so both neighbouring pieces trace the
 * exact same curve (one reversed) and the picture stays seamless.
 */
function jigsawCells(cols: number, rows: number): Vec2[][] {
  const cache = new Map<string, Vec2[]>();

  const build = (a: Vec2, b: Vec2, internal: boolean, key: string): Vec2[] => {
    const hit = cache.get(key);
    if (hit) return hit;
    let pts: Vec2[];
    if (!internal) {
      pts = [a, b];
    } else {
      const dir = (a.x + a.y) % 2 === 0 ? 1 : -1;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      const nx = -ey / len;
      const ny = ex / len;
      pts = catmullRom(TAB_CONTROLS, 5).map((p) => {
        const off = p.y * TAB_SCALE * dir * len;
        return { x: a.x + ex * p.x + nx * off, y: a.y + ey * p.x + ny * off };
      });
    }
    cache.set(key, pts);
    return pts;
  };

  const reverse = (pts: Vec2[]): Vec2[] => pts.slice().reverse();
  const cells: Vec2[][] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const bottom = build({ x: c, y: r }, { x: c + 1, y: r }, r > 0, `h:${c}:${r}`);
      const right = build(
        { x: c + 1, y: r },
        { x: c + 1, y: r + 1 },
        c < cols - 1,
        `v:${c + 1}:${r}`,
      );
      const top = reverse(
        build({ x: c, y: r + 1 }, { x: c + 1, y: r + 1 }, r < rows - 1, `h:${c}:${r + 1}`),
      );
      const left = reverse(
        build({ x: c, y: r }, { x: c, y: r + 1 }, c > 0, `v:${c}:${r}`),
      );
      const ring: Vec2[] = [];
      [bottom, right, top, left].forEach((edge, idx) => {
        for (let k = idx === 0 ? 0 : 1; k < edge.length; k += 1) ring.push(edge[k]);
      });
      ring.pop();
      cells.push(ring);
    }
  }
  return cells;
}

/** Honeycomb: pointy-top hexagons in offset rows (unit circumradius). */
function hexagonCells(cols: number, rows: number): Vec2[][] {
  const S = Math.sqrt(3);
  const cells: Vec2[][] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = (c + 0.5 * (r % 2)) * S;
      const cy = r * 1.5;
      const pts: Vec2[] = [];
      for (let k = 0; k < 6; k += 1) {
        const a = (Math.PI / 3) * k + Math.PI / 2;
        pts.push({ x: cx + Math.cos(a), y: cy + Math.sin(a) });
      }
      cells.push(pts);
    }
  }
  return cells;
}

/** Mosaic: equilateral subdivision of a big triangle of side `rows` (rows²). */
function triangleCells(rows: number): Vec2[][] {
  const H = Math.sqrt(3) / 2;
  const cells: Vec2[][] = [];
  for (let k = 0; k < rows; k += 1) {
    const y0 = k * H;
    const y1 = (k + 1) * H;
    const x0 = -rows / 2 + k * 0.5;
    const up = rows - k;
    for (let j = 0; j < up; j += 1) {
      cells.push([
        { x: x0 + j, y: y0 },
        { x: x0 + j + 1, y: y0 },
        { x: x0 + j + 0.5, y: y1 },
      ]);
    }
    for (let j = 0; j < up - 1; j += 1) {
      cells.push([
        { x: x0 + j + 1, y: y0 },
        { x: x0 + j + 1.5, y: y1 },
        { x: x0 + j + 0.5, y: y1 },
      ]);
    }
  }
  return cells;
}

/** Scale every ring to fit `target`, then measure centroids + drop radius. */
function finalize(raw: Vec2[][], target: number): BoardLayout {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pts of raw) {
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = target / Math.max(w, h);
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;

  const cells: PieceCell[] = raw.map((pts) => {
    const points = ensureCCW(
      pts.map((p) => ({ x: (p.x - ox) * scale, y: (p.y - oy) * scale })),
    );
    return { points, center: polygonCentroid(points) };
  });

  const nn: number[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    let best = Infinity;
    for (let j = 0; j < cells.length; j += 1) {
      if (i === j) continue;
      const d = Math.hypot(
        cells[i].center.x - cells[j].center.x,
        cells[i].center.y - cells[j].center.y,
      );
      if (d < best) best = d;
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  nn.sort((a, b) => a - b);
  const median = nn.length ? nn[Math.floor(nn.length / 2)] : target;

  return {
    width: w * scale,
    height: h * scale,
    cells,
    spacing: median * 0.7,
  };
}

/** Build every piece outline for `shape` on a `cols × rows` board. */
export function buildLayout(
  shape: PieceShape,
  cols: number,
  rows: number,
  target = 4,
): BoardLayout {
  let raw: Vec2[][];
  switch (shape) {
    case "jigsaw":
      raw = jigsawCells(cols, rows);
      break;
    case "hexagon":
      raw = hexagonCells(cols, rows);
      break;
    case "triangle":
      raw = triangleCells(rows);
      break;
    default:
      raw = squareCells(cols, rows);
  }
  return finalize(raw, target);
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

/* ------------------------------ scattering -------------------------------- */

/**
 * Spread `count` pieces over a square `area` as a jittered grid — the "dumped
 * the box out on the table" arrangement. Deterministic per (count, seed) so a
 * build is reproducible, but each seed gives a fresh-looking pile.
 */
export function scatterPositions(
  count: number,
  area: number,
  seed = 0,
): Vec2[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cw = area / cols;
  const ch = area / rows;
  const rng = mulberry32(seed * 2654435761 + count * 40503 + 1);
  const out: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const jx = (rng() - 0.5) * cw * 0.5;
    const jy = (rng() - 0.5) * ch * 0.5;
    out.push({
      x: -area / 2 + cw * (c + 0.5) + jx,
      y: area / 2 - ch * (r + 0.5) + jy,
    });
  }
  return out;
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

/**
 * homeMenu
 * ========
 * The data model behind the inside-the-cube homepage. The visitor stands at the
 * centre of a room whose six inner walls each carry a 3x3 menu of tiles
 * (6 x 9 = 54). A tile either navigates to a real route (`kind: "link"`) or
 * opens an in-cube information card (`kind: "info"`), so nothing ever 404s.
 *
 * Kept framework-free so the structure can be unit-tested and reused; the
 * Three.js rendering lives in components/HomeCube.tsx.
 */

export type TileIcon =
  | "cube"
  | "pyramid"
  | "image"
  | "square"
  | "puzzle"
  | "hexagon"
  | "triangle"
  | "book"
  | "code"
  | "shuffle"
  | "lightbulb"
  | "robot"
  | "compass"
  | "gauge"
  | "hand"
  | "magnet"
  | "trophy"
  | "layers"
  | "rotate"
  | "target"
  | "zap"
  | "clock"
  | "list"
  | "play"
  | "scan"
  | "message"
  | "file"
  | "sparkles"
  | "info"
  | "box"
  | "shield"
  | "globe"
  | "mail"
  | "camera"
  | "keyboard"
  | "palette"
  | "music"
  | "users"
  | "star";

export interface MenuTile {
  /** Short label drawn on the 3D tile. */
  label: string;
  /** One-line subtitle under the label. */
  hint: string;
  kind: "link" | "info";
  /** Route for `kind: "link"`. */
  href?: string;
  icon: TileIcon;
  /** [from, to] hex colours for the tile accent strip. */
  tint: [string, string];
  /** Info-card paragraph(s). */
  body?: string;
  /** Info-card bullet points. */
  bullets?: string[];
}

export interface MenuFace {
  id: string;
  /** Big title watermarked on the wall + shown in the HUD. */
  name: string;
  tagline: string;
  /** [from, to] hex colours for the wall gradient. */
  bg: [string, string];
  /** Tailwind text colour for the HUD/overlay. */
  accent: string;
  /** rgba glow used for hover rings in the HUD. */
  glow: string;
  /** Exactly nine tiles (row-major, top-left first). */
  tiles: MenuTile[];
}

const link = (
  label: string,
  hint: string,
  href: string,
  icon: TileIcon,
  tint: [string, string],
): MenuTile => ({ label, hint, kind: "link", href, icon, tint });

const info = (
  label: string,
  hint: string,
  icon: TileIcon,
  tint: [string, string],
  body: string,
  bullets: string[],
): MenuTile => ({ label, hint, kind: "info", icon, tint, body, bullets });

export const HOME_FACES: MenuFace[] = [
  {
    id: "games",
    name: "Games",
    tagline: "Pick a puzzle",
    bg: ["#1c2764", "#0a1129"],
    accent: "text-indigo-300",
    glow: "rgba(129,140,248,0.6)",
    tiles: [
      link("Rubik's Cube", "Classic 3x3x3", "/rubiks-cube", "cube", ["#38bdf8", "#6366f1"]),
      link("Clover Pyramid", "Expert jumbling", "/clover-pyramid", "pyramid", ["#e879f9", "#8b5cf6"]),
      link("Photo Jigsaw", "Any picture", "/image-puzzle", "image", ["#fbbf24", "#fb7185"]),
      info(
        "How to Play",
        "Controls & goals",
        "book",
        ["#60a5fa", "#38bdf8"],
        "Every puzzle runs entirely in your browser on mouse or touch. There is no login and no server.",
        [
          "Rubik's Cube: drag a sticker to turn its face.",
          "Clover Pyramid: drag a corner disk to twist it.",
          "Photo Jigsaw: drag a piece onto its slot to snap it.",
          "Drag the empty background to orbit the camera.",
        ],
      ),
      info(
        "Notation",
        "Talks an LLM understands",
        "code",
        ["#a78bfa", "#818cf8"],
        "Moves use compact, standard tokens so bots and humans describe the same turn.",
        [
          "Cube (Singmaster): U R F D L B, with ' for counter-clockwise and 2 for a half turn.",
          "Clover disks are A B C D, each in 60-degree detents (A, A', A2, A3).",
          "Every move is reversible: X' undoes X.",
        ],
      ),
      info(
        "Scramble",
        "Fair random states",
        "shuffle",
        ["#f472b6", "#ec4899"],
        "The Scramble button applies a long random sequence and animates every turn.",
        [
          "Scrambles avoid trivial immediate inverses.",
          "The Rubik's Cube scramble is generated fresh each press.",
          "Reset returns any puzzle to its solved state.",
        ],
      ),
      info(
        "Solve Tips",
        "Where to start",
        "lightbulb",
        ["#fbbf24", "#f59e0b"],
        "New to twisty puzzles? Work in layers and only learn one algorithm at a time.",
        [
          "Cube: solve a cross, then corners, then the second layer, then the last layer.",
          "Clover: think of each corner disk as a small gear train.",
          "Jigsaw: start from a straight edge or a distinctive part of the picture.",
        ],
      ),
      info(
        "AI Play",
        "window.RubiksCubeAPI",
        "robot",
        ["#34d399", "#10b981"],
        "A documented, UI-free API lets any agent drive the cube from the console.",
        [
          "applyMoves(\"R U R' U'\") executes a Singmaster sequence.",
          "getState() / getFacelets() read a 54-character Kociemba string.",
          "getPrompt() returns a paste-ready prompt for an LLM.",
          "The Clover Pyramid exposes an equivalent getState()/applyMoves() API.",
        ],
      ),
      info(
        "Pick Your Mode",
        "Casual to Expert",
        "compass",
        ["#fb923c", "#f97316"],
        "Three puzzles span a wide difficulty range so there is always a next step.",
        [
          "Photo Jigsaw - relaxing, no algorithms.",
          "Rubik's Cube - the familiar casual classic.",
          "Clover Pyramid - expert jumbling tetrahedron.",
        ],
      ),
    ],
  },
  {
    id: "types",
    name: "Puzzle Types",
    tagline: "Four jigsaw styles",
    bg: ["#4a2a12", "#28110a"],
    accent: "text-amber-300",
    glow: "rgba(251,191,36,0.6)",
    tiles: [
      link("Photo Jigsaw", "Open the puzzle", "/image-puzzle", "image", ["#fbbf24", "#fb7185"]),
      info(
        "Classic Squares",
        "A clean grid",
        "square",
        ["#fbbf24", "#f59e0b"],
        "The easiest style: the picture is cut into a plain grid of square tiles.",
        [
          "Works for any grid size from 3x3 to 6x6.",
          "Tiles swap positions - a great warm-up.",
          "Perfect for quick sessions.",
        ],
      ),
      info(
        "Jigsaw Knobs",
        "Interlocking edges",
        "puzzle",
        ["#fb7185", "#f43f5e"],
        "True jigsaw pieces with tabs and blanks that share exact curves with their neighbours.",
        [
          "Internal edges get a randomised knob profile.",
          "Border edges stay straight.",
          "Curves are cached so adjacent pieces fit perfectly.",
        ],
      ),
      info(
        "Honeycomb Hexes",
        "Pointy-top hexagons",
        "hexagon",
        ["#34d399", "#10b981"],
        "The picture is tiled into a honeycomb of pointy-top hexagons.",
        [
          "Six neighbours per piece.",
          "No wasted corners - the board fills the frame.",
          "Visually striking with any photo.",
        ],
      ),
      info(
        "Triangle Mosaic",
        "A shimmering mosaic",
        "triangle",
        ["#60a5fa", "#3b82f6"],
        "A triangle subdivision that turns the picture into a faceted mosaic.",
        [
          "The most pieces per picture - a real challenge.",
          "Up and down triangles interlock.",
          "Great for bold, high-contrast images.",
        ],
      ),
      info(
        "Choose a Picture",
        "Samples or your own",
        "image",
        ["#a78bfa", "#8b5cf6"],
        "Start from a built-in sample or bring your own image.",
        [
          "Pick one of the generated sample pictures.",
          "Upload a file, or drop one anywhere on the table.",
          "Nothing is uploaded - the image stays on your device.",
        ],
      ),
      info(
        "Difficulty",
        "3x3 up to 6x6",
        "gauge",
        ["#22d3ee", "#06b6d4"],
        "More pieces means more of a puzzle - choose your grid size.",
        [
          "3x3 Breezy, 4x4 Classic.",
          "5x5 Tricky, 6x6 Tough.",
          "Piece counts scale to the shape you pick.",
        ],
      ),
      info(
        "Free Drag",
        "Like a real puzzle",
        "hand",
        ["#f472b6", "#db2777"],
        "Pieces live loose on a table, exactly like tipping a real jigsaw out of the box.",
        [
          "Drag any piece anywhere on the mat.",
          "Leave pieces wherever you like.",
          "There is no wrong move - only a solved picture.",
        ],
      ),
      info(
        "Snap & Swap",
        "Drop to place",
        "magnet",
        ["#fb923c", "#ea580c"],
        "Drop a piece near its slot to snap it home, or onto another to swap.",
        [
          "A gentle snap radius keeps placement forgiving.",
          "Tap one piece then another to swap them.",
          "Watch the progress bar fill as the picture forms.",
        ],
      ),
    ],
  },
  {
    id: "guides",
    name: "Guides",
    tagline: "Learn & improve",
    bg: ["#0f3a2e", "#061c16"],
    accent: "text-emerald-300",
    glow: "rgba(52,211,153,0.6)",
    tiles: [
      info(
        "Beginner Method",
        "Layer by layer",
        "book",
        ["#34d399", "#10b981"],
        "The classic layer-by-layer approach is the friendliest way into the 3x3.",
        [
          "1. Build a white cross.",
          "2. Insert the four white corners.",
          "3. Solve the middle-layer edges.",
          "4. Orient and permute the last layer.",
        ],
      ),
      info(
        "CFOP Basics",
        "Speedsolving",
        "layers",
        ["#22d3ee", "#0ea5e9"],
        "CFOP - Cross, F2L, OLL, PLL - is the most common speedsolving method.",
        [
          "F2L pairs corners and edges at the same time.",
          "OLL orients the last layer; PLL permutes it.",
          "Learn algorithms in small sets.",
        ],
      ),
      info(
        "Clover Turns",
        "Corner disks",
        "rotate",
        ["#e879f9", "#c026d3"],
        "The Clover Pyramid has four corner disks that turn in 60-degree detents.",
        [
          "Disks are labelled A, B, C, D.",
          "A turn moves petals between neighbouring disks.",
          "A3 is a half rotation of a disk.",
        ],
      ),
      info(
        "Jumbling Moves",
        "Shared edges",
        "shuffle",
        ["#fb7185", "#e11d48"],
        "Odd clover turns are jumbling moves: edge pieces slide onto petal slots.",
        [
          "Jumbling mixes shared edges between corners.",
          "These states look scrambled but are always solvable.",
          "Watch the 18-character state code to track progress.",
        ],
      ),
      info(
        "Reading Notation",
        "Token by token",
        "code",
        ["#60a5fa", "#3b82f6"],
        "Notation is just a recipe: each token is one turn.",
        [
          "X turns clockwise, X' counter-clockwise.",
          "2 means a half turn, 3 means three detents.",
          "Read a sequence left to right.",
        ],
      ),
      info(
        "Practice Drills",
        "Build muscle memory",
        "target",
        ["#fbbf24", "#f59e0b"],
        "Short, repeated drills beat long unfocused sessions.",
        [
          "Repeat one algorithm ten times slowly.",
          "Scramble, solve, and note your move count.",
          "Focus on accuracy first, then speed.",
        ],
      ),
      info(
        "Finger Tricks",
        "Smoother turns",
        "zap",
        ["#facc15", "#eab308"],
        "On a real cube, small finger flicks replace wrist turns; on screen, short drags help.",
        [
          "Use short, decisive drags rather than long ones.",
          "Keep the pointer near the face you are turning.",
          "Turn the whole cube with the background drag.",
        ],
      ),
      info(
        "Time & Moves",
        "Measure progress",
        "clock",
        ["#818cf8", "#6366f1"],
        "The HUD counts your moves so you can watch yourself improve.",
        [
          "Fewer moves usually means better look-ahead.",
          "Reset the counter when you start a fresh solve.",
          "The AI panel can replay sequences for you.",
        ],
      ),
      info(
        "Glossary",
        "Common terms",
        "list",
        ["#94a3b8", "#64748b"],
        "A quick reference for the jargon.",
        [
          "Face: one side of the cube (U R F D L B).",
          "Slice: a middle layer turn.",
          "Algorithm: a memorised sequence of moves.",
          "Scramble: a random sequence applied to a solved puzzle.",
        ],
      ),
    ],
  },
  {
    id: "ai",
    name: "AI & API",
    tagline: "Drive it with code",
    bg: ["#2a1b4d", "#12082a"],
    accent: "text-violet-300",
    glow: "rgba(167,139,250,0.6)",
    tiles: [
      info(
        "Rubik's API",
        "window.RubiksCubeAPI",
        "robot",
        ["#a78bfa", "#8b5cf6"],
        "A stable, documented control surface exposes the live cube without the UI.",
        [
          "applyMoves(\"R U R' U'\") executes a sequence.",
          "getMoveCount(), getHistory(), isSolved().",
          "scramble() and reset() drive the on-screen controls.",
        ],
      ),
      info(
        "Clover API",
        "Remote-play ready",
        "robot",
        ["#e879f9", "#d946ef"],
        "The Clover Pyramid exposes the same remote-play pattern.",
        [
          "getState() returns an 18-character slot code.",
          "applyMoves(\"A B' C2\") runs disk tokens.",
          "A solved pyramid reads 000111222333eeeeee.",
        ],
      ),
      info(
        "Singmaster Notation",
        "The shared language",
        "code",
        ["#60a5fa", "#3b82f6"],
        "Face turns use the standard U R F D L B alphabet.",
        [
          "X clockwise, X' counter-clockwise, X2 half turn.",
          "Parsers ignore unknown tokens and report them.",
          "The same tokens appear in your history panel.",
        ],
      ),
      info(
        "Apply an Algorithm",
        "One call",
        "play",
        ["#34d399", "#10b981"],
        "Paste any algorithm and watch it execute smoothly.",
        [
          "Open the AI Play panel on the cube page.",
          "Type or paste a sequence and run it.",
          "Every token is validated before it runs.",
        ],
      ),
      info(
        "Read the State",
        "Machine-readable",
        "scan",
        ["#22d3ee", "#06b6d4"],
        "Read a complete snapshot of the puzzle at any moment.",
        [
          "getFacelets(): 54-character Kociemba string.",
          "getState(): facelets, move count, solved flag, history, busy.",
          "The Clover Pyramid returns its 18-character code.",
        ],
      ),
      info(
        "Scramble via API",
        "Reproducible rounds",
        "shuffle",
        ["#f472b6", "#db2777"],
        "Script fair scrambles for benchmarks or bots.",
        [
          "api.scramble() applies a fresh random scramble.",
          "Read the history to log the exact sequence.",
          "Pair with applyMoves() to solve it programmatically.",
        ],
      ),
      info(
        "Remote-Play Prompt",
        "Paste-ready",
        "message",
        ["#fb923c", "#f97316"],
        "getPrompt() returns instructions plus the current state, ready for an LLM.",
        [
          "Includes the protocol, the state and the rules.",
          "Paste it into any chat model to get moves back.",
          "The model replies with tokens you can apply.",
        ],
      ),
      info(
        "llms.txt",
        "For crawlers & agents",
        "file",
        ["#94a3b8", "#64748b"],
        "A machine-readable summary of the apps and their APIs lives at /llms.txt.",
        [
          "Describes the puzzle routes and protocols.",
          "Lists the window APIs and their methods.",
          "Referenced from robots.txt for discovery.",
        ],
      ),
      info(
        "Automation Ideas",
        "What will you build?",
        "sparkles",
        ["#facc15", "#eab308"],
        "The API is deliberately tiny so it is easy to automate.",
        [
          "A solver that reads state and posts a solution.",
          "A benchmark that times many random scrambles.",
          "A classroom bot that validates student algorithms.",
        ],
      ),
    ],
  },
  {
    id: "about",
    name: "About",
    tagline: "The studio",
    bg: ["#0e2a4a", "#061424"],
    accent: "text-sky-300",
    glow: "rgba(56,189,248,0.6)",
    tiles: [
      info(
        "What is Twisty Lab",
        "Three puzzles, one place",
        "info",
        ["#38bdf8", "#0ea5e9"],
        "Twisty Lab is a small studio of interactive 3D puzzles you can play instantly.",
        [
          "The Rubik's Cube, the Clover Pyramid and the Photo Jigsaw.",
          "Built with vanilla Three.js and exported as a static site.",
          "No account, no paywall, no tracking.",
        ],
      ),
      info(
        "Tech Stack",
        "What powers it",
        "code",
        ["#a78bfa", "#8b5cf6"],
        "A modern but deliberately lean stack.",
        [
          "Next.js static export for the shell and routing.",
          "Vanilla Three.js for every 3D scene (no react-three-fiber).",
          "Tailwind CSS for the interface.",
        ],
      ),
      info(
        "Vanilla Three.js",
        "Hand-rolled 3D",
        "box",
        ["#34d399", "#10b981"],
        "Each puzzle is a hand-written Three.js scene for full control over interaction.",
        [
          "Custom pointer picking and drag maths.",
          "GPU-friendly instanced geometry where it helps.",
          "Careful teardown of every resource on unmount.",
        ],
      ),
      info(
        "No Login, No Tracking",
        "Yours alone",
        "shield",
        ["#22d3ee", "#06b6d4"],
        "There is nothing to sign up for and nothing to leak.",
        [
          "Images you upload never leave your device.",
          "No analytics or advertising scripts.",
          "Works offline once loaded.",
        ],
      ),
      info(
        "Accessibility",
        "For everyone",
        "hand",
        ["#fbbf24", "#f59e0b"],
        "The puzzles aim to be usable by keyboard and assistive tech where possible.",
        [
          "Semantic landmarks, labels and live regions.",
          "Keyboard and touch support on the controls.",
          "High-contrast HUD text and ARIA live move counters.",
        ],
      ),
      info(
        "Performance",
        "Light and fast",
        "gauge",
        ["#fb7185", "#e11d48"],
        "The whole site is a static bundle with no backend round-trips.",
        [
          "Capped pixel ratio for smooth rendering.",
          "Delta-timed animation so turns look the same at any frame rate.",
          "Loaded on demand behind dynamic imports.",
        ],
      ),
      info(
        "Open & Static",
        "Deploy anywhere",
        "globe",
        ["#60a5fa", "#3b82f6"],
        "The output is plain HTML, CSS and JavaScript.",
        [
          "Ships as a static export you can host anywhere.",
          "Configured for GitHub Pages with a base path.",
          "No server runtime required.",
        ],
      ),
      info(
        "Feedback",
        "Tell us what you think",
        "mail",
        ["#f472b6", "#db2777"],
        "Found a bug or want a new puzzle? Feedback is welcome.",
        [
          "Report issues through the project tracker.",
          "Suggest a puzzle style or a new feature.",
          "Bug reports with a state code are easiest to reproduce.",
        ],
      ),
      info(
        "Changelog",
        "How it grew",
        "clock",
        ["#94a3b8", "#64748b"],
        "The studio keeps growing, one puzzle at a time.",
        [
          "Started with the Rubik's Cube.",
          "Added the Clover Pyramid and its jumbling moves.",
          "Added the Photo Jigsaw with four piece shapes.",
          "Rebuilt the homepage as this inside-the-cube menu.",
        ],
      ),
    ],
  },
  {
    id: "extras",
    name: "Extras",
    tagline: "More to explore",
    bg: ["#3a1030", "#1a0715"],
    accent: "text-fuchsia-300",
    glow: "rgba(232,121,249,0.6)",
    tiles: [
      info(
        "Camera Controls",
        "Look around",
        "camera",
        ["#e879f9", "#c026d3"],
        "Every scene uses the same orbit-style camera.",
        [
          "Drag the background to rotate the view.",
          "Scroll or pinch to zoom (where enabled).",
          "Drag a puzzle piece directly to move it.",
        ],
      ),
      info(
        "Touch Gestures",
        "On phones & tablets",
        "hand",
        ["#38bdf8", "#0ea5e9"],
        "The puzzles are built touch-first.",
        [
          "One finger drags pieces or turns faces.",
          "Finger on empty space orbits the camera.",
          "Tap two jigsaw pieces to swap them.",
        ],
      ),
      info(
        "Keyboard Shortcuts",
        "For desktop",
        "keyboard",
        ["#a78bfa", "#8b5cf6"],
        "Useful keys while exploring.",
        [
          "Tab moves focus through the controls.",
          "Enter activates the focused button.",
          "Escape closes the current information card.",
        ],
      ),
      info(
        "Themes",
        "Look & feel",
        "palette",
        ["#fbbf24", "#f59e0b"],
        "Each puzzle has its own colour identity.",
        [
          "Games in indigo, jigsaw types in amber.",
          "Guides in emerald, AI in violet.",
          "The walls of this room reflect the same palette.",
        ],
      ),
      info(
        "Sound (soon)",
        "On the roadmap",
        "music",
        ["#34d399", "#10b981"],
        "Gentle click and turn sounds are planned.",
        [
          "Off by default to respect autoplay rules.",
          "A simple toggle will live in each HUD.",
          "No sounds will ever load until you opt in.",
        ],
      ),
      info(
        "Leaderboards (soon)",
        "Compete later",
        "trophy",
        ["#facc15", "#eab308"],
        "Optional, privacy-respecting leaderboards are planned.",
        [
          "Entirely opt-in - no tracking by default.",
          "Likely just move counts and times.",
          "Local bests will come first.",
        ],
      ),
      info(
        "Community",
        "Share & learn",
        "users",
        ["#f472b6", "#db2777"],
        "Twisty puzzles have a huge, friendly community.",
        [
          "Share a scramble via its state string.",
          "Compare solutions and algorithms.",
          "Teach someone else the beginner method.",
        ],
      ),
      info(
        "Credits",
        "Built with care",
        "star",
        ["#fb923c", "#f97316"],
        "Made with vanilla Three.js and a lot of cube maths.",
        [
          "Inspired by the classic 3D puzzle community.",
          "Thanks to the standard Singmaster and Kociemba conventions.",
          "Everything runs client-side, for free.",
        ],
      ),
      info(
        "Back to Games",
        "Start playing",
        "compass",
        ["#60a5fa", "#3b82f6"],
        "Ready when you are - the three puzzles are one click away.",
        [
          "Rubik's Cube for the classic.",
          "Clover Pyramid for a real challenge.",
          "Photo Jigsaw for something relaxing.",
        ],
      ),
    ],
  },
];

/** Layout sanity check used by tests: every face must have exactly 9 tiles. */
export function assertMenuShape(): void {
  if (HOME_FACES.length !== 6) {
    throw new Error(`Expected 6 faces, found ${HOME_FACES.length}`);
  }
  for (const face of HOME_FACES) {
    if (face.tiles.length !== 9) {
      throw new Error(`Face "${face.id}" has ${face.tiles.length} tiles, want 9`);
    }
  }
}

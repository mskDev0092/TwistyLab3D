# Worklog

---
Task ID: 1
Agent: main (Super Z)
Task: Build a fully interactive 3D Rubik's Cube with vanilla Three.js + Next.js App Router (TypeScript, static export, no SSR for the 3D canvas)

Work Log:
- Initialized fullstack environment via init script; inspected project (Next 16.1.3, React 19, src/ layout, @/* alias)
- Installed three@0.186.1 + @types/three@0.186.0
- Created src/lib/RubiksCubeLogic.ts: 27-cubie integer lattice model, rounded-body + sticker scene graph, pivot-group slice rotation (grabSlice / rotateSliceTo / releaseSlice), grid commit via rotation-matrix + round, solved-state detection, reset, random move generator
- Created src/components/RubiksCubeCanvas.tsx: WebGLRenderer(antialias, alpha) + PCFShadowMap + shadows, PerspectiveCamera + OrbitControls (damping, autoRotate until first click), AmbientLight + 2 DirectionalLights, ShadowMaterial ground, Raycaster drag plane math (axis = faceNormal x dragDir), snap-to-90° tween on release, scramble queue, move counter, solved toast, HUD, strict useEffect cleanup (RAF cancel, listeners, controls.dispose, geometry/material dispose, renderer.dispose, canvas.remove)
- Created src/components/RubiksCubeWrapper.tsx: 'use client' boundary, next/dynamic ssr:false + loading spinner
- Rewrote src/app/page.tsx as Server Component with metadata rendering the wrapper
- Added next.config.mjs (output:'export', images.unoptimized, trailingSlash), deleted next.config.ts and src/app/api/ (static-export incompatible), build script -> "next build", start -> "npx serve out"
- Fixed lint error (react-hooks/set-state-in-effect) by deferring setError/setReady into async callbacks
- Fixed three r186 deprecation: PCFSoftShadowMap -> PCFShadowMap
- Fixed mobile overflow: aspect-aware camera.zoom in ResizeObserver
- Verified via agent-browser: desktop render, scramble (all 6 colors mixed), face drag (Moves:1, clean 90° snap), background orbit, reset to solved, 390x844 mobile fit; console and page errors clean; lint passes

Stage Summary:
- Deliverable: runnable interactive 3D Rubik's Cube at / (dev server on :3000)
- Files: src/lib/RubiksCubeLogic.ts, src/components/RubiksCubeCanvas.tsx, src/components/RubiksCubeWrapper.tsx, src/app/page.tsx, next.config.mjs, package.json (scripts)
- Verification screenshots in .zscripts/verify-*.png; `next build` will emit static site to out/

---
Task ID: 2
Agent: main (Super Z)
Task: Add AI Play feature — copy cube state/instructions to any AI, paste back move solutions, live counters

Work Log:
- Created src/lib/cubeNotation.ts (pure): Kociemba facelet constants, FACE_MOVE_AXIS map, parseMoveSequence (tolerant prose parser, strips punctuation, flags unsupported tokens like M/E/S/x/y/z), buildFaceletNet (ASCII unfolded net), buildAiPrompt (self-contained AI instructions)
- Extended src/lib/RubiksCubeLogic.ts: getFaceletString() — 54-char state via sticker world normals + grid->row/col mapping; re-exported notation types from cubeNotation
- Created src/components/AiPlayPanel.tsx: step-1 copy card (live prompt textarea, Copy full prompt / Copy state only with clipboard fallback + toasts), step-2 paste card (live parse feedback, move preview chips, ignored-token warnings, Run N moves button with runProgress label)
- Wired RubiksCubeCanvas.tsx: facelets state synced after every commit (drag/scramble/reset/paste-run), executePastedMoves (scrolls to cube, animates each move at 240ms, updates move counter per quarter turn, solved detection + celebration), cubeSolved state split from celebration banner, page restructured (cube section + AI panel + sticky footer), AI Play scroll button in HUD
- Fixed: named-vs-default import crash; direction convention bug (bare move = CW = -1 quarter turns about positive outward axis) — verified against standard Kociemba facelet tables
- Browser-verified: solved string exact match; R and U round-trips match standard tables; prose "Sure! Solution: R U R' U' F2 - good luck!!" parsed 5 moves; scramble R U F D L B then inverse B' L' D' F' U' R' returned EXACT solved string with prompt flipping to "Already solved"; copy toast works; mobile panel layout fixed (badge wrap)

Stage Summary:
- AI Play loop complete: copy state -> external AI solves -> paste reply -> cube executes with counters updating
- Facelet export validated against Kociemba standard (R and U tables); full scramble/solve round-trip passes
- Lint clean, dev server clean, all verification screenshots in .zscripts/

---
Task ID: 3
Agent: main (Super Z)
Task: Scramble variety + single-screen left AI panel + prompt v2 (state at end, MOVES:/STATE_AFTER contract) + open bot/AI access

Work Log:
- Created src/lib/scramble.ts: WCA-style scramble generator — crypto.getRandomValues with rejection sampling, 25 moves, no same face twice in a row, no same axis 3x in a row, module-level lastScrambleKey guarantees a different scramble every time
- Rewrote buildAiPrompt as Remote-Play Protocol v2: strict reply contract (MOVES: line + optional STATE_AFTER: prediction), color/notation/state-format docs, HISTORY line, machine-readable CURRENT CUBE STATE block moved to the very END of the prompt
- parseMoveSequence now normalizes unicode primes (R′ R’ R´ -> R') before tokenizing
- RubiksCubeLogic: extracted faceOfDirection/faceletIndexOf helpers (fixed missing Z-branch bug that corrupted F/B facelets), added applyFacelets() — searches 24 axis-aligned rotations per cubie, validates outward stickers + unique grid cells + full 54-facelet coverage, commits only physically reachable states
- RubiksCubeCanvas: single-screen studio layout (h-dvh, overflow-hidden; desktop = AI panel LEFT 26/28rem + cube right via flex-row-reverse, mobile = cube top 52dvh + panel below, page never scrolls); scramble uses generateScramble; move history (drag-derived face tokens, scramble tokens, run tokens, cap 80) feeds prompt HISTORY; executePastedMoves verifies STATE_AFTER vs real result with toast + badge; run progress shows current token; window.RubiksCubeAPI exposed (getFacelets/getState/getPrompt/applyMoves/applyFacelets/scramble/reset/isSolved/help) with cleanup on unmount; #state=<facelets> URL deep-link loading at boot
- AiPlayPanel rewritten as vertical left column: copy prompt (emerald primary) + copy state only, STATE_AFTER detection chip, parse feedback, verify verdict badge, Bot & agent access details section; removed scroll-to-panel button (always visible now)
- page.tsx: AI-playable metadata, robots index/follow, JSON-LD WebApplication; public/robots.txt rewritten with bot-access notes; public/llms.txt created (full headless/API/protocol docs)
- tsconfig excludes examples/tests/skills/tool-results (pre-existing template files broke next build type-check)
- Fixed: faceOfDirection Z-branch regression caught by browser verification (F block "?" -> exact solved string restored)
- Verified via agent-browser: 1440x900 single screen panel-left/cube-right, 3 scrambles all distinct (25 moves, 0 WCA violations), R U R' U' + U R U' R' round-trip exact solved, STATE_AFTER match/mismatch badges both fire, garbage applyFacelets rejected, applyFacelets loads scrambled state (moves reset, history cleared), #state= deep link boots exact state, manual drag commits + logs U' token, copy toast fires, 390x844 mobile no page scroll + chip wrap fixed; lint + next build (static) clean; screenshots .zscripts/verify3-*.png

Stage Summary:
- Scrambles are now crypto-random WCA-style and never repeat within a session
- AI panel permanently visible on one screen (left of cube), prompt v2 ends with the live state and requests a MOVES:/STATE_AFTER reply
- Cube is fully open to external bots: window.RubiksCubeAPI, #state= deep links, /llms.txt, /robots.txt, JSON-LD
- Static export builds clean to out/ (robots.txt + llms.txt included)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build, package manager, linter, or test suite. Do not look for or invent one (no `package.json`, no test runner).

- Run the game: open `index.html` directly, or serve the folder statically, e.g. `python3 -m http.server 8000` and visit `http://localhost:8000`. Serving is the recommended way.
- Verifying changes: there are no automated tests. Check changes by loading the game in a browser and playing it. Browser console errors are the main signal, since `game.js` runs as a plain `<script>` with no module system.

## Architecture

Vanilla JS, HTML5 Canvas, and CSS. No dependencies, no transpilation. The three files are loaded in order by `index.html`, and `game.js` is the only place with logic.

- `index.html` defines the DOM IDs that `game.js` grabs at load time (`board`, `next-canvas`, `hold-canvas`, `preview-canvas`, `preview-section`, `score`, `lines`, `level`, `combo`, `b2b`, `energy-bar`, `energy-hint`, `objective`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `next-btn`, `menu-btn`, `classic-btn`, `challenge-btn`, `theme-toggle`). Renaming any of these breaks the game silently or throws on startup.
- `style.css` is presentation only; it styles the overlay via `.hidden` toggling from JS, and the overlay buttons via `hidden` attributes.
- `game.js` is one script with global state: `board`, `current`, `queue` (upcoming pieces, at least 6), `hold`, `holdUsed`, `score`, `lines`, `level`, `combo`, `b2b`, `energy`, `paused`, `abilityOpen`, `gameOver`, `levelDone`, `inMenu`, `mode`, `challenge`, plus timers (`freezeMs`, `slowMs`, `flashMs`, `revealMs`) and `lastSnapshot` (for Undo). `init()` starts a run; `showMenu()` shows the Classic/Challenge menu on load and from the Menu button.

### Game loop and state flow

- `loop(ts)` is a `requestAnimationFrame` loop. It ticks effect timers and the challenge, then accumulates `dt` into `dropAccum` (not while frozen). When that reaches the drop interval (×3 while slowed), the current piece moves down one row, or `lockPiece()` runs if it can't. `startGame()` and `stopGame()` control the loop via `loopRunning`.
- `lockPiece()` = snapshot (for Undo) → `detectTSpin()` → `applyPower()` for power pieces, else `merge()` → `clearLines()` → `scoreLock()` → queue reward (the 1x1 after a Tetris, or a pending power-up) → `spawn()` → `challenge.onLock()` → `checkChallenge()`. `spawn()` takes `queue[0]`, refills the queue, and calls `endGame()` if the new piece collides immediately.
- `isRowComplete()` lets WILD cells (Dye) fill gaps: a row clears when its empty cells are all covered by WILD cells.
- Power-ups: every 5 cleared lines sets `powerupPending`; the next lock queues a random power piece (types 13–17). Power pieces are not merged; their effect runs on lock.
- Abilities: `E` opens a menu once `energy` is full. Keys 1–4 pick preview, swap, slow, or undo. `E` or `Esc` cancels.
- Challenge mode: `CHALLENGES` holds 5 objects with `setup`, `tick`, `onLock`, `won`, `lost`, `status`, and flags `reverseRotation` and `hideLocked`. A win shows the level-complete overlay; a loss is game over.
- Input is handled in one `keydown` listener. `KeyT` (theme) works everywhere. In the menu all other keys are ignored. `KeyP` pauses; `KeyE` opens abilities; other keys are ignored while paused, in an ability menu, or after game over or a level clear.
- `collide(shape, x, y)` is the single source of truth for legality. Movement, rotation (`tryRotate`, which tries kick offsets `0, ±1, ±2`), soft drop, hard drop, and the ghost piece (`ghostY`) all go through it.

### Rendering

`draw()` redraws the full canvas each frame: grid, locked board cells, ghost piece (alpha 0.2), then the current piece. `drawBlock` is shared by the board canvas and the preview canvas (`drawNext`, which uses a 30px block size instead of `BLOCK`).

### Constants that tie files together

`COLS`, `ROWS`, and `BLOCK` in `game.js` determine the canvas size. `index.html` hardcodes `width="300" height="600"` on `#board`. If you change the grid or block size, update the canvas attributes too. `COLORS` is indexed by piece type (1–19), and `PIECES[type]` uses the same indices for 1–17, so the two arrays must stay aligned. Board cells store the piece type number, which doubles as the color index. Types 1–7 are the standard tetrominoes, 8–10 are pentominoes (+, U, Y), 11 is a 1x1 reward given after a 4-line clear, 12 is a hollow 3x3 challenge piece (level 3+ only), 13–17 are power-ups (bomb, lightning, dye, gravity, freeze), 18 is WILD and 19 is garbage (board cells only, no `PIECES` entry). Spawn odds live in `randomPiece()` and the `*_CHANCE` constants.

## Language

The README and the in-app UI text are in English (`lang="en"`, labels like `PAUSED`, `Restart`, `Score`). Keep new user-facing strings in English to match.

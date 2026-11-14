# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build, package manager, linter, or test suite. Do not look for or invent one (no `package.json`, no test runner).

- Run the game: open `index.html` directly, or serve the folder statically, e.g. `python3 -m http.server 8000` and visit `http://localhost:8000`. Serving is the recommended way.
- Verifying changes: there are no automated tests. Check changes by loading the game in a browser and playing it. Browser console errors are the main signal, since `game.js` runs as a plain `<script>` with no module system.

## Architecture

Vanilla JS, HTML5 Canvas, and CSS. No dependencies, no transpilation. The three files are loaded in order by `index.html`, and `game.js` is the only place with logic.

- `index.html` defines the DOM IDs that `game.js` grabs at load time (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`). Renaming any of these breaks the game silently or throws on startup.
- `style.css` is presentation only; it styles the overlay via `.hidden` toggling from JS.
- `game.js` is one script with global state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). `init()` resets all of it and is also the restart handler.

### Game loop and state flow

- `loop(ts)` is a `requestAnimationFrame` loop. It accumulates `dt` into `dropAccum`; when that reaches `dropInterval`, the current piece moves down one row, or `lockPiece()` runs if it can't.
- `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current`, draws a new `next`, and calls `endGame()` if the new piece collides immediately.
- Input is handled in one `keydown` listener. `KeyP` toggles pause and is handled before the paused/game-over guard; all other keys are ignored while paused or game over.
- `collide(shape, x, y)` is the single source of truth for legality. Movement, rotation (`tryRotate`, which tries kick offsets `0, ±1, ±2`), soft drop, hard drop, and the ghost piece (`ghostY`) all go through it.

### Rendering

`draw()` redraws the full canvas each frame: grid, locked board cells, ghost piece (alpha 0.2), then the current piece. `drawBlock` is shared by the board canvas and the preview canvas (`drawNext`, which uses a 30px block size instead of `BLOCK`).

### Constants that tie files together

`COLS`, `ROWS`, and `BLOCK` in `game.js` determine the canvas size. `index.html` hardcodes `width="300" height="600"` on `#board`. If you change the grid or block size, update the canvas attributes too. `COLORS` is indexed by piece type (1–7), and `PIECES[type]` uses the same indices, so the two arrays must stay aligned. Board cells store the piece type number, which doubles as the color index.

## Language

The README and the in-app UI text are in English (`lang="en"`, labels like `PAUSED`, `Restart`, `Score`). Keep new user-facing strings in English to match.

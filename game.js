'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Cell/piece type indices. COLORS and PIECES share these indices.
const COLORS = [
  null,
  '#4dd0e1', // 1 I - cyan
  '#ffd54f', // 2 O - yellow
  '#ba68c8', // 3 T - purple
  '#81c784', // 4 S - green
  '#e57373', // 5 Z - red
  '#42a5f5', // 6 J - blue
  '#ffb74d', // 7 L - orange
  '#f06292', // 8 + - pink
  '#aed581', // 9 U - lime
  '#7986cb', // 10 Y - indigo
  '#90a4ae', // 11 1x1 - blue-grey
  '#8d6e63', // 12 hollow 3x3 - brown
  '#ff7043', // 13 bomb
  '#fff176', // 14 lightning
  '#00bfa5', // 15 dye
  '#455a64', // 16 gravity
  '#b3e5fc', // 17 freeze
  '#f5f5f5', // 18 WILD (board only)
  '#616161', // 19 garbage (board only)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (pentomino)
  [[9,0,9],[9,9,9],[0,0,0]],                  // U (pentomino)
  [[0,10,0,0],[10,10,10,10],[0,0,0,0],[0,0,0,0]], // Y (pentomino)
  [[11]],                                     // 1x1 (reward after Tetris)
  [[12,12,12],[12,0,12],[12,12,12]],          // hollow 3x3 (challenge)
  [[13]],                                     // bomb (power-up)
  [[14]],                                     // lightning (power-up)
  [[15]],                                     // dye (power-up)
  [[16]],                                     // gravity (power-up)
  [[17]],                                     // freeze (power-up)
];

const STANDARD_TYPES = [1, 2, 3, 4, 5, 6, 7];
const PENTOMINO_TYPES = [8, 9, 10];
const SINGLE_TYPE = 11;
const HOLLOW_TYPE = 12;
const BOMB = 13, LIGHTNING = 14, DYE = 15, GRAVITY = 16, FREEZE = 17;
const POWER_TYPES = [BOMB, LIGHTNING, DYE, GRAVITY, FREEZE];
const WILD_TYPE = 18;
const GARBAGE_TYPE = 19;
const POWER_LABELS = { 13: 'B', 14: 'L', 15: 'D', 16: 'G', 17: 'F', 18: 'W' };
const LAST_COLOR_TYPE = 12; // types 1..12 are the colors that Dye can target

const PENTOMINO_CHANCE = 0.10;
const HOLLOW_CHANCE = 0.03;
const HOLLOW_MIN_LEVEL = 3;
const TETRIS_LINES = 4;
const POWERUP_EVERY = 5;
const FREEZE_MS = 5000;
const SLOW_MS = 10000;
const SLOW_FACTOR = 3;
const REVEAL_MS = 400;
const FLASH_MS = 400;
const POPUP_MS = 1400;
const QUEUE_LEN = 6;
const ENERGY_MAX = 100;
const ENERGY_PER_LINE = 10;
const GARBAGE_EVERY_MS = 10000;
const B2B_MULT = 1.5;

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_BONUS = [400, 800, 1200, 1600];
const PERFECT_BONUS = [0, 800, 1200, 1800, 2000];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const previewSection = document.getElementById('preview-section');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const b2bEl = document.getElementById('b2b');
const energyBar = document.getElementById('energy-bar');
const energyHint = document.getElementById('energy-hint');
const objectiveEl = document.getElementById('objective');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const nextBtn = document.getElementById('next-btn');
const menuBtn = document.getElementById('menu-btn');
const classicBtn = document.getElementById('classic-btn');
const challengeBtn = document.getElementById('challenge-btn');
const OVERLAY_BUTTONS = [restartBtn, nextBtn, menuBtn, classicBtn, challengeBtn];
const themeToggle = document.getElementById('theme-toggle');

// Canvas colors that depend on the theme. Read from CSS variables and cached;
// refreshed by setTheme() so they are not queried every frame.
const themeColors = { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)', outline: 'transparent', ghostAlpha: 0.2, popup: '#7aa2f7' };

const ABILITY_KEYS = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4 };

// Game state. Set by init() (a run) or showMenu().
let board, current, queue, hold, holdUsed;
let score, lines, level, combo, b2b, energy;
let nextPowerupAt, powerupPending, lastMoveRotated, previewSpawns;
let slowMs, freezeMs, flashMs, revealMs, effects, lastSnapshot;
let dropAccum, dropInterval, lastTime, animId, loopRunning;
let paused, abilityOpen, gameOver, levelDone, inMenu;
let mode, challenge, challengeIndex;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function clonePiece(p) {
  return p ? { type: p.type, shape: p.shape.map(row => row.slice()), x: p.x, y: p.y } : null;
}

function randomPiece() {
  const roll = Math.random();
  let type;
  if (roll < HOLLOW_CHANCE) {
    type = level >= HOLLOW_MIN_LEVEL ? HOLLOW_TYPE : pick(STANDARD_TYPES);
  } else if (roll < HOLLOW_CHANCE + PENTOMINO_CHANCE) {
    type = pick(PENTOMINO_TYPES);
  } else {
    type = pick(STANDARD_TYPES);
  }
  return makePiece(type);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function rotateCCW(shape) {
  return rotateCW(rotateCW(rotateCW(shape)));
}

function tryRotate() {
  const ccw = !!(challenge && challenge.reverseRotation);
  const rotated = ccw ? rotateCCW(current.shape) : rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveRotated = true;
      return;
    }
  }
}

function moveSide(dx) {
  if (!collide(current.shape, current.x + dx, current.y)) {
    current.x += dx;
    lastMoveRotated = false;
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// A row clears when it has no empty cells, or when its empty cells can all be
// covered by WILD cells (Dye). An all-empty row never clears.
function isRowComplete(row) {
  let empty = 0, wild = 0;
  for (const v of row) {
    if (v === 0) empty++;
    else if (v === WILD_TYPE) wild++;
  }
  return empty === 0 || (wild > 0 && empty <= wild);
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (isRowComplete(board[r])) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastMoveRotated = false;
    score += 1;
  } else {
    lockPiece();
  }
}

// T-spin: a rotated T with at least 3 of the 4 corners of its 3x3 box blocked.
function detectTSpin() {
  if (current.type !== 3 || !lastMoveRotated) return false;
  const x0 = current.x, y0 = current.y;
  const corners = [[x0, y0], [x0 + 2, y0], [x0, y0 + 2], [x0 + 2, y0 + 2]];
  let blocked = 0;
  for (const [x, y] of corners) {
    if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x])) blocked++;
  }
  return blocked >= 3;
}

function mostCommonColor() {
  const counts = new Array(LAST_COLOR_TYPE + 1).fill(0);
  for (const row of board)
    for (const v of row)
      if (v >= 1 && v <= LAST_COLOR_TYPE) counts[v]++;
  let best = 0, bestCount = 0;
  for (let t = 1; t <= LAST_COLOR_TYPE; t++) {
    if (counts[t] > bestCount) { best = t; bestCount = counts[t]; }
  }
  return best;
}

// Power-up pieces are not merged. Their effect fires on lock, at the piece cell.
function applyPower(type) {
  const px = current.x, py = current.y;
  switch (type) {
    case BOMB:
      for (let r = py - 1; r <= py + 1; r++)
        for (let c = px - 1; c <= px + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      break;
    case LIGHTNING:
      if (Math.random() < 0.5) {
        board[py].fill(0);
      } else {
        for (let r = 0; r < ROWS; r++) board[r][px] = 0;
      }
      break;
    case DYE: {
      let target = py + 1 < ROWS ? board[py + 1][px] : 0;
      if (target === 0 || target === GARBAGE_TYPE || target === WILD_TYPE) target = mostCommonColor();
      if (!target) break;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c] === target) board[r][c] = WILD_TYPE;
      break;
    }
    case GRAVITY:
      for (let c = 0; c < COLS; c++) {
        const vals = [];
        for (let r = ROWS - 1; r >= 0; r--) if (board[r][c]) vals.push(board[r][c]);
        for (let r = ROWS - 1; r >= 0; r--) board[r][c] = vals[ROWS - 1 - r] || 0;
      }
      break;
    case FREEZE:
      freezeMs = FREEZE_MS;
      break;
  }
}

function riseGarbage() {
  if (board[0].some(v => v !== 0)) { endGame(); return; }
  board.shift();
  const hole = Math.floor(Math.random() * COLS);
  board.push(Array.from({ length: COLS }, (_, c) => (c === hole ? 0 : GARBAGE_TYPE)));
  if (collide(current.shape, current.x, current.y)) endGame();
}

function addEffect(text) {
  effects.push({ text, life: POPUP_MS });
  if (effects.length > 4) effects.shift();
}

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

// Scoring for one lock: combo multiplier, back-to-back, T-spin and perfect-clear bonuses.
function scoreLock(cleared, tspin, perfect) {
  combo = cleared > 0 ? combo + 1 : 0;
  const difficult = cleared === TETRIS_LINES || (tspin && cleared > 0);
  let gained = 0;
  let b2bHit = false;
  if (cleared > 0) {
    let factor = 1;
    if (difficult && b2b) { factor = B2B_MULT; b2bHit = true; }
    gained += LINE_SCORES[cleared] * level * combo * factor;
    b2b = difficult;
  }
  if (tspin) gained += TSPIN_BONUS[cleared] * level;
  if (perfect) gained += PERFECT_BONUS[cleared] * level;
  score += Math.round(gained);

  lines += cleared;
  level = runStartLevel + Math.floor(lines / 10);
  dropInterval = dropIntervalFor(level);
  energy = Math.min(ENERGY_MAX, energy + cleared * ENERGY_PER_LINE);

  if (lines >= nextPowerupAt) {
    powerupPending = true;
    while (nextPowerupAt <= lines) nextPowerupAt += POWERUP_EVERY;
  }

  const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
  if (tspin) addEffect(cleared ? `T-SPIN ${names[cleared]}` : 'T-SPIN');
  if (cleared === TETRIS_LINES) addEffect('TETRIS');
  if (b2bHit) addEffect('BACK-TO-BACK x1.5');
  if (combo >= 2) addEffect(`COMBO x${combo}`);
  if (perfect) addEffect('PERFECT CLEAR');
  if (cleared === TETRIS_LINES || perfect) flashMs = FLASH_MS;
}

function takeSnapshot() {
  return {
    board: board.map(row => row.slice()),
    current: clonePiece(current),
    queue: queue.map(clonePiece),
    score, lines, level, dropInterval, combo, b2b,
    nextPowerupAt, powerupPending, hold, holdUsed,
  };
}

// Undo restores the board and piece state from just before the last lock.
// Energy spent or gained is not refunded.
function undo() {
  if (!lastSnapshot || gameOver || levelDone || inMenu) return false;
  const s = lastSnapshot;
  board = s.board.map(row => row.slice());
  current = clonePiece(s.current);
  queue = s.queue.map(clonePiece);
  score = s.score;
  lines = s.lines;
  level = s.level;
  dropInterval = s.dropInterval;
  combo = s.combo;
  b2b = s.b2b;
  nextPowerupAt = s.nextPowerupAt;
  powerupPending = s.powerupPending;
  hold = s.hold;
  holdUsed = s.holdUsed;
  dropAccum = 0;
  lastMoveRotated = false;
  lastSnapshot = null;
  updateHUD();
  return true;
}

function lockPiece() {
  lastSnapshot = takeSnapshot();
  const tspin = detectTSpin();
  if (POWER_TYPES.includes(current.type)) applyPower(current.type);
  else merge();
  const cleared = clearLines();
  const perfect = cleared > 0 && board.every(row => row.every(v => v === 0));
  scoreLock(cleared, tspin, perfect);

  // Tetris reward: the 1x1 piece spawns next. Otherwise a pending power-up does.
  if (cleared === TETRIS_LINES) {
    queue[0] = makePiece(SINGLE_TYPE);
  } else if (powerupPending) {
    queue[0] = makePiece(pick(POWER_TYPES));
    powerupPending = false;
  }
  holdUsed = false;
  spawn();
  if (challenge && challenge.onLock) challenge.onLock();
  checkChallenge();
}

function spawn() {
  current = queue.shift();
  queue.push(randomPiece());
  lastMoveRotated = false;
  if (previewSpawns > 0) previewSpawns--;
  if (collide(current.shape, current.x, current.y)) endGame();
}

function holdPiece() {
  if (holdUsed || !current) return;
  const t = current.type;
  if (hold === null) {
    hold = t;
    spawn();
  } else {
    const swap = hold;
    hold = t;
    current = makePiece(swap);
    lastMoveRotated = false;
    if (collide(current.shape, current.x, current.y)) endGame();
  }
  holdUsed = true;
}

function swapCurrent() {
  current = makePiece(pick(STANDARD_TYPES.filter(t => t !== current.type)));
  lastMoveRotated = false;
  if (collide(current.shape, current.x, current.y)) endGame();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo > 1 ? `x${combo}` : '-';
  b2bEl.textContent = b2b ? 'ON' : '-';
  energyBar.style.width = `${energy}%`;
  energyHint.textContent = energy >= ENERGY_MAX ? 'READY: press E' : '';
  objectiveEl.textContent = challenge ? `${challenge.name}\n${challenge.status()}` : 'Classic';
}

// ---- Overlay and flow ----

function showOverlay(title, text, buttons) {
  overlayTitle.textContent = title;
  overlayScore.textContent = text;
  for (const b of OVERLAY_BUTTONS) b.hidden = !buttons.includes(b);
  overlay.classList.remove('hidden');
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  stopGame();
  restartBtn.textContent = mode === 'challenge' ? 'Retry' : 'Restart';
  const where = challenge ? ` · ${challenge.name}` : '';
  showOverlay('GAME OVER', `Score: ${score.toLocaleString()}${where}`, [restartBtn, menuBtn]);
}

function endLevel() {
  levelDone = true;
  stopGame();
  const i = challengeIndex;
  if (i < CHALLENGES.length - 1) {
    nextBtn.textContent = `Next: ${CHALLENGES[i + 1].name}`;
    showOverlay(`CHALLENGE ${i + 1} CLEAR`, `${CHALLENGES[i].name} complete · Score: ${score.toLocaleString()}`, [nextBtn, menuBtn]);
  } else {
    showOverlay('ALL CHALLENGES CLEAR', `Score: ${score.toLocaleString()}`, [menuBtn]);
  }
}

function checkChallenge() {
  if (!challenge || gameOver || levelDone) return;
  if (challenge.won()) endLevel();
  else if (challenge.lost()) endGame();
}

function startGame() {
  if (loopRunning || inMenu || paused || abilityOpen || gameOver || levelDone) return;
  loopRunning = true;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function stopGame() {
  loopRunning = false;
  cancelAnimationFrame(animId);
}

function togglePause() {
  if (inMenu || gameOver || levelDone || abilityOpen) return;
  paused = !paused;
  if (paused) {
    stopGame();
    openPauseMenu();
  } else {
    closePauseMenu();
    startGame();
  }
}

// ---- Pause menu ----
// Opened by P or Escape. While paused, keydown ignores all game input (it returns early on `paused`).
const pauseMenu = document.getElementById('pause-menu');
const pauseMainView = document.getElementById('pause-main');
const pauseControlsView = document.getElementById('pause-controls');
const pauseResumeBtn = document.getElementById('pause-resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseBackBtn = document.getElementById('pause-back-btn');
const startLevelSelect = document.getElementById('start-level');

// runStartLevel is the level the current run began on; scoreLock() adds lines/10 to it.
// The start-level select holds the choice for the next classic run (init() reads it).
let runStartLevel = 1;

// Focus is not moved into the menu: a focused button would take Space/Enter, which the
// paused keydown handler ignores, so a native click would fire instead.
function openPauseMenu() {
  pauseMainView.hidden = false;
  pauseControlsView.hidden = true;
  pauseMenu.hidden = false;
}

function closePauseMenu() {
  pauseMenu.hidden = true;
}

pauseResumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', retry);
pauseControlsBtn.addEventListener('click', () => {
  pauseMainView.hidden = true;
  pauseControlsView.hidden = false;
});
pauseBackBtn.addEventListener('click', () => {
  pauseControlsView.hidden = true;
  pauseMainView.hidden = false;
});

// ---- Abilities ----

function abilityText() {
  return [
    '1  Preview next 5 pieces',
    '2  Swap current piece',
    '3  Slow time (10s)',
    `4  Undo last placement${lastSnapshot ? '' : ' (unavailable)'}`,
    'E / Esc  cancel',
  ].join('\n');
}

function openAbility() {
  if (inMenu || gameOver || levelDone || paused || abilityOpen || energy < ENERGY_MAX) return;
  abilityOpen = true;
  stopGame();
  showOverlay('ABILITY', abilityText(), []);
}

function closeAbility() {
  abilityOpen = false;
  if (inMenu || gameOver || levelDone) return;
  overlay.classList.add('hidden');
  startGame();
}

function useAbility(n) {
  energy = 0;
  if (n === 1) previewSpawns = 5;
  else if (n === 2) swapCurrent();
  else if (n === 3) slowMs = SLOW_MS;
  else if (n === 4) undo();
  closeAbility();
}

function handleAbilityKey(code) {
  if (code === 'KeyE' || code === 'Escape') { closeAbility(); return; }
  const n = ABILITY_KEYS[code];
  if (!n) return;
  if (n === 4 && !lastSnapshot) return;
  useAbility(n);
}

// ---- Challenges ----

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function preplace() {
  for (let r = ROWS - 6; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if ((c * 3 + r * 2) % 4 !== 0) board[r][c] = 1 + ((r + c) % 7);
}

function riseGarbageTick(self) {
  self.garbageIn += GARBAGE_EVERY_MS;
  riseGarbage();
}

const CHALLENGES = [
  {
    name: 'Sprint',
    reverseRotation: false,
    setup() { this.timeLeft = 120000; },
    tick(dt) { this.timeLeft -= dt; },
    won() { return lines >= 40; },
    lost() { return this.timeLeft <= 0; },
    status() { return `${lines}/40 lines · ${fmtTime(this.timeLeft)} left`; },
  },
  {
    name: 'Rising Garbage',
    reverseRotation: false,
    setup() { this.timeLeft = 60000; this.garbageIn = GARBAGE_EVERY_MS; },
    tick(dt) {
      this.timeLeft -= dt;
      this.garbageIn -= dt;
      if (this.garbageIn <= 0) riseGarbageTick(this);
    },
    won() { return this.timeLeft <= 0; },
    lost() { return false; },
    status() { return `Survive ${fmtTime(this.timeLeft)} · next row ${fmtTime(this.garbageIn)}`; },
  },
  {
    name: 'Pre-placed',
    reverseRotation: false,
    setup() { preplace(); },
    won() { return lines >= 15; },
    lost() { return false; },
    status() { return `${lines}/15 lines`; },
  },
  {
    name: 'Invisible',
    reverseRotation: false,
    hideLocked: true,
    onLock() { revealMs = REVEAL_MS; },
    won() { return lines >= 10; },
    lost() { return false; },
    status() { return `${lines}/10 lines`; },
  },
  {
    name: 'Reverse Rotation',
    reverseRotation: true,
    setup() { dropInterval = 700; },
    won() { return lines >= 15; },
    lost() { return false; },
    status() { return `${lines}/15 lines`; },
  },
];

// ---- Run lifecycle ----

function init() {
  stopGame();
  inMenu = false;
  gameOver = false;
  levelDone = false;
  paused = false;
  abilityOpen = false;
  board = createBoard();
  score = 0;
  lines = 0;
  // Challenge setups are tuned for level 1, so the start level applies to Classic only.
  runStartLevel = mode === 'challenge' ? 1 : Number(startLevelSelect.value);
  level = runStartLevel;
  combo = 0;
  b2b = false;
  energy = 0;
  nextPowerupAt = POWERUP_EVERY;
  powerupPending = false;
  hold = null;
  holdUsed = false;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  slowMs = 0;
  freezeMs = 0;
  flashMs = 0;
  revealMs = 0;
  previewSpawns = 0;
  effects = [];
  lastSnapshot = null;
  lastMoveRotated = false;
  queue = [];
  while (queue.length < QUEUE_LEN) queue.push(randomPiece());
  overlay.classList.add('hidden');
  closePauseMenu();
  spawn();
  updateHUD();
  startGame();
}

function startClassic() {
  mode = 'classic';
  challenge = null;
  challengeIndex = 0;
  init();
}

function startChallengeAt(i) {
  mode = 'challenge';
  challengeIndex = i;
  challenge = CHALLENGES[i];
  init();
  challenge.setup();
  updateHUD();
  draw();
}

function retry() {
  if (mode === 'challenge') startChallengeAt(challengeIndex);
  else startClassic();
}

function showMenu() {
  stopGame();
  inMenu = true;
  mode = 'classic';
  challenge = null;
  challengeIndex = 0;
  gameOver = false;
  levelDone = false;
  paused = false;
  abilityOpen = false;
  board = createBoard();
  current = null;
  queue = [];
  hold = null;
  holdUsed = false;
  effects = [];
  lastSnapshot = null;
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  b2b = false;
  energy = 0;
  updateHUD();
  classicBtn.textContent = 'Classic';
  challengeBtn.textContent = 'Challenge';
  closePauseMenu();
  showOverlay('TETRIS', 'Choose a mode', [classicBtn, challengeBtn]);
  draw();
}

function tickEffects(dt) {
  flashMs = Math.max(0, flashMs - dt);
  revealMs = Math.max(0, revealMs - dt);
  freezeMs = Math.max(0, freezeMs - dt);
  slowMs = Math.max(0, slowMs - dt);
  for (const e of effects) e.life -= dt;
  effects = effects.filter(e => e.life > 0);
}

function loop(ts) {
  const dt = Math.max(0, Math.min(ts - lastTime, 100));
  lastTime = ts;
  tickEffects(dt);
  if (challenge) {
    if (challenge.tick) challenge.tick(dt);
    checkChallenge();
  }
  if (loopRunning) {
    if (freezeMs <= 0) dropAccum += dt;
    const interval = slowMs > 0 ? dropInterval * SLOW_FACTOR : dropInterval;
    if (dropAccum >= interval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        lastMoveRotated = false;
      } else {
        lockPiece();
      }
    }
  }
  // A stopped loop (game over, level clear, pause, ability menu) draws once and exits.
  if (!loopRunning) { draw(); return; }
  updateHUD();
  draw();
  animId = requestAnimationFrame(loop);
}

// ---- Rendering ----

function readThemeColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  themeColors.grid = get('--grid', '#22222e');
  themeColors.highlight = get('--block-highlight', 'rgba(255,255,255,0.12)');
  themeColors.outline = get('--block-outline', 'transparent');
  themeColors.popup = get('--accent', '#7aa2f7');
  const alpha = parseFloat(get('--ghost-alpha', '0.2'));
  themeColors.ghostAlpha = Number.isFinite(alpha) ? alpha : 0.2;
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('theme', theme); } catch (e) { /* storage unavailable */ }

  const nextLabel = theme === 'light' ? 'Dark mode' : 'Light mode';
  themeToggle.textContent = nextLabel;
  themeToggle.setAttribute('aria-label', `Switch to ${nextLabel.toLowerCase()}`);

  readThemeColors();
  // The loop is stopped while paused, in menus, or after game over, so redraw manually.
  if (board) draw();
}

function toggleTheme() {
  setTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = COLORS[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeColors.highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  // outline (keeps light pieces readable on the light theme)
  context.strokeStyle = themeColors.outline;
  context.lineWidth = 1;
  context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
  // power-up and wild markers
  const label = POWER_LABELS[colorIndex];
  if (label) {
    context.fillStyle = 'rgba(0,0,0,0.7)';
    context.font = `bold ${Math.round(size * 0.5)}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

// Draws a shape centered in a box of cols x rows cells, starting at rowOffset cells down.
function drawShape(context, shape, size, cols, rows, rowOffset, alpha) {
  const offX = Math.floor((cols - shape[0].length) / 2);
  const offY = rowOffset + Math.floor((rows - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function drawEffects() {
  if (!effects.length) return;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = themeColors.popup;
  effects.forEach((e, i) => {
    ctx.globalAlpha = Math.min(1, e.life / 400);
    ctx.fillText(e.text, (COLS * BLOCK) / 2, 200 - i * 24);
  });
  ctx.globalAlpha = 1;
}

function drawSide() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (queue.length) drawShape(nextCtx, queue[0].shape, 30, 4, 4, 0);
  if (hold !== null) drawShape(holdCtx, PIECES[hold], 30, 4, 4, 0, holdUsed ? 0.35 : 1);
  previewSection.hidden = !(previewSpawns > 0);
  if (previewSpawns > 0) {
    for (let i = 0; i < 5 && i < queue.length; i++)
      drawShape(previewCtx, queue[i].shape, 16, 8, 4, i * 4, 1);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board (hidden while the Invisible challenge is active, except right after a lock)
  const hideLocked = challenge && challenge.hideLocked && revealMs <= 0;
  if (!hideLocked) {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        drawBlock(ctx, c, r, board[r][c], BLOCK);
  }

  if (flashMs > 0) {
    ctx.fillStyle = `rgba(255,255,255,${((0.35 * flashMs) / FLASH_MS).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (current) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, themeColors.ghostAlpha);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }

  drawEffects();
  drawSide();
}

// ---- Input and startup ----

document.addEventListener('keydown', e => {
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (inMenu) return;
  if (abilityOpen) { handleAbilityKey(e.code); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'KeyE') { openAbility(); return; }
  if (paused || gameOver || levelDone) return;
  switch (e.code) {
    case 'ArrowLeft':
      moveSide(-1);
      break;
    case 'ArrowRight':
      moveSide(1);
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', retry);
nextBtn.addEventListener('click', () => startChallengeAt(challengeIndex + 1));
menuBtn.addEventListener('click', showMenu);
classicBtn.addEventListener('click', startClassic);
challengeBtn.addEventListener('click', () => startChallengeAt(0));
themeToggle.addEventListener('click', () => {
  toggleTheme();
  // Drop focus so Space/Enter keep controlling the game instead of re-clicking.
  themeToggle.blur();
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) { /* storage unavailable */ }
setTheme(savedTheme === 'light' ? 'light' : 'dark');

showMenu();

'use strict';

// Grid geometry (matches GitHub's contribution graph proportions)
const CELL = 10;
const GAP = 2;
const PITCH = CELL + GAP;
const PAD = 16;
const GRID_TOP = 36;
const SHIP_OFFSET = 44; // distance from grid bottom to top of ship

const PALETTES = {
  light: {
    bg: '#ffffff',
    empty: '#ebedf0',
    levels: ['#9be9a8', '#40c463', '#30a14e', '#216e39'],
    ship: '#0969da',
    bullet: '#cf222e',
    flash: '#f59e0b',
    text: '#57606a',
    star: null,
  },
  dark: {
    bg: '#0d1117',
    empty: '#161b22',
    levels: ['#0e4429', '#006d32', '#26a641', '#39d353'],
    ship: '#58a6ff',
    bullet: '#ff7b72',
    flash: '#f2cc60',
    text: '#8b949e',
    star: '#c9d1d9',
  },
};

// Original 5x5 alien sprites, one per contribution level (1-4).
const SPRITES = [
  ['.###.', '#.#.#', '#####', '.#.#.', '#...#'],
  ['#...#', '.###.', '##.##', '#####', '.#.#.'],
  ['.#.#.', '#####', '#.#.#', '#####', '#.#.#'],
  ['#.#.#', '.###.', '#.#.#', '#####', '.#.#.'],
];

const SHIP = [
  '....#....',
  '...###...',
  '.#######.',
  '#########',
  '##.###.##',
];
const SHIP_PX = 2;
const SHIP_W = SHIP[0].length * SHIP_PX;
const SHIP_H = SHIP.length * SHIP_PX;

/** Converts a bitmap (array of strings, '#' = filled) into a compact SVG path. */
function bitmapPath(rows, px) {
  let d = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') { x++; continue; }
      const start = x;
      while (x < row.length && row[x] === '#') x++;
      const w = (x - start) * px;
      d += `M${start * px} ${y * px}h${w}v${px}h-${w}z`;
    }
  });
  return d;
}

/** Small deterministic PRNG so the same data always renders the same SVG. */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const num = (n) => Number(n.toFixed(3)).toString();

/**
 * Plans every shot: when the ship moves, when each bullet fires and lands.
 * Targets are cleared column by column, left to right, bottom cell first.
 */
function planTimeline(cells, geom, speed) {
  const s = Math.max(0.25, Math.min(4, speed));
  const MOVE_PER_COL = 0.045 / s;
  const MIN_MOVE = 0.1 / s;
  const SHOT_GAP = 0.11 / s;
  const BULLET_SPEED = 520 * s; // px per second
  const START_PAUSE = 0.6;
  const EXPLODE = 0.35;
  const CLEAR_HOLD = 1.8;
  const RESPAWN = 0.8;

  const targets = cells
    .filter((c) => c.level > 0)
    .sort((a, b) => a.col - b.col || b.row - a.row);

  const shipMoves = [];
  const shots = [];
  let t = START_PAUSE;
  let shipCol = targets.length ? targets[0].col : 0;
  const startCol = shipCol;

  for (const cell of targets) {
    if (cell.col !== shipCol) {
      const dur = Math.max(MIN_MOVE, Math.abs(cell.col - shipCol) * MOVE_PER_COL);
      shipMoves.push({ start: t, end: t + dur, from: shipCol, to: cell.col });
      t += dur;
      shipCol = cell.col;
    }
    const y0 = geom.shipY - 6;
    const y1 = geom.cellY(cell.row) + CELL - 2;
    const fire = t;
    const hit = fire + (y0 - y1) / BULLET_SPEED;
    shots.push({ cell, fire, hit, y0, y1 });
    t += SHOT_GAP;
  }

  const lastHit = shots.length ? Math.max(...shots.map((x) => x.hit)) : t;
  const clearStart = lastHit + EXPLODE;
  const respawnStart = clearStart + CLEAR_HOLD;
  const duration = respawnStart + RESPAWN;

  // Ship drifts back to its starting column while the wave respawns.
  if (shipCol !== startCol) {
    shipMoves.push({ start: clearStart, end: duration - 0.05, from: shipCol, to: startCol });
  }

  return { shots, shipMoves, startCol, clearStart, respawnStart, duration, explode: EXPLODE };
}

/**
 * Renders the animated SVG.
 * @param {{weeks: Array<Array<{row:number, level:number}>>, total?: number}} data
 * @param {{palette?: 'light'|'dark', style?: 'aliens'|'squares', speed?: number}} options
 */
function render(data, options = {}) {
  const pal = PALETTES[options.palette] || PALETTES.light;
  const style = options.style === 'squares' ? 'squares' : 'aliens';
  const speed = Number(options.speed) || 1;

  const cells = [];
  data.weeks.forEach((week, col) => {
    week.forEach((day) => cells.push({ col, row: day.row, level: day.level }));
  });

  const cols = Math.max(1, data.weeks.length);
  const gridW = cols * PITCH - GAP;
  const gridBottom = GRID_TOP + 7 * PITCH - GAP;
  const shipY = gridBottom + SHIP_OFFSET;
  const groundY = shipY + SHIP_H + 4;
  const width = PAD * 2 + gridW;
  const height = groundY + PAD;

  const geom = {
    shipY,
    cellX: (col) => PAD + col * PITCH,
    cellY: (row) => GRID_TOP + row * PITCH,
    colCenter: (col) => PAD + col * PITCH + CELL / 2,
  };

  const plan = planTimeline(cells, geom, speed);
  const D = plan.duration;
  const pct = (sec) => num(Math.min(100, Math.max(0, (sec / D) * 100)));
  const EPS = 0.01; // percent

  const css = [];
  const body = [];

  css.push(
    `.c{transform-box:fill-box;transform-origin:center}`,
    `text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;fill:${pal.text};letter-spacing:1px}`
  );

  // Background
  body.push(`<rect width="${width}" height="${height}" fill="${pal.bg}"/>`);

  // Stars (dark palette only)
  if (pal.star) {
    const rand = prng(cols * 7919 + cells.length);
    css.push(`@keyframes tw{0%,100%{opacity:.15}50%{opacity:.7}}.st{animation:tw 3s ease-in-out infinite}`);
    for (let i = 0; i < 45; i++) {
      const x = num(rand() * width);
      const y = num(rand() * height);
      const r = rand() < 0.15 ? 0.9 : 0.5;
      const delay = num(-rand() * 3);
      body.push(`<circle class="st" cx="${x}" cy="${y}" r="${r}" fill="${pal.star}" style="animation-delay:${delay}s"/>`);
    }
  }

  // Header
  const total = typeof data.total === 'number' ? data.total : null;
  if (total !== null) {
    body.push(`<text x="${PAD}" y="22">HI-SCORE ${String(total).padStart(5, '0')}</text>`);
  }
  body.push(`<text x="${width - PAD}" y="22" text-anchor="end">WAVE ${new Date().getUTCFullYear()}</text>`);

  // Sprite definitions
  const defs = [];
  if (style === 'aliens') {
    SPRITES.forEach((rows, i) => defs.push(`<path id="a${i + 1}" d="${bitmapPath(rows, 2)}"/>`));
  }
  defs.push(`<path id="ship" d="${bitmapPath(SHIP, SHIP_PX)}"/>`);
  body.push(`<defs>${defs.join('')}</defs>`);

  // Empty cells (static)
  const empties = cells
    .filter((c) => c.level === 0)
    .map((c) => `<rect x="${geom.cellX(c.col)}" y="${geom.cellY(c.row)}" width="${CELL}" height="${CELL}" rx="2"/>`);
  body.push(`<g fill="${pal.empty}">${empties.join('')}</g>`);

  // Targets: each gets its own explode-then-respawn keyframes
  const respawnPct = pct(plan.respawnStart);
  plan.shots.forEach((shot, i) => {
    const { cell } = shot;
    const color = pal.levels[Math.min(3, cell.level - 1)];
    const h = pct(shot.hit);
    const flash = pct(shot.hit + 0.1);
    const gone = pct(shot.hit + plan.explode);
    css.push(
      `@keyframes k${i}{0%,${h}%{opacity:1;transform:scale(1);fill:${color}}` +
        `${flash}%{opacity:1;transform:scale(1.8);fill:${pal.flash}}` +
        `${gone}%,${respawnPct}%{opacity:0;transform:scale(.2);fill:${pal.flash}}` +
        `100%{opacity:1;transform:scale(1);fill:${color}}}` +
        `.k${i}{animation:k${i} ${num(D)}s linear infinite}`
    );
    const shape =
      style === 'aliens'
        ? `<use href="#a${cell.level}" class="c k${i}" fill="${color}"/>`
        : `<rect width="${CELL}" height="${CELL}" rx="2" class="c k${i}" fill="${color}"/>`;
    body.push(`<g transform="translate(${geom.cellX(cell.col)} ${geom.cellY(cell.row)})">${shape}</g>`);
  });

  // Bullets
  const bullets = [];
  plan.shots.forEach((shot, i) => {
    const f = Number(pct(shot.fire));
    const f0 = num(Math.max(0, f - EPS));
    const hEnd = Number(pct(shot.hit));
    const h1 = num(Math.min(100, hEnd + EPS));
    const y0 = `translateY(${num(shot.y0)}px)`;
    const y1 = `translateY(${num(shot.y1)}px)`;
    css.push(
      `@keyframes b${i}{0%,${f0}%{opacity:0;transform:${y0}}${num(f)}%{opacity:1;transform:${y0}}` +
        `${num(hEnd)}%{opacity:1;transform:${y1}}${h1}%,100%{opacity:0;transform:${y1}}}` +
        `.b${i}{animation:b${i} ${num(D)}s linear infinite}`
    );
    bullets.push(`<rect class="b${i}" x="${geom.colCenter(shot.cell.col) - 1}" width="2" height="6" opacity="0"/>`);
  });
  body.push(`<g fill="${pal.bullet}">${bullets.join('')}</g>`);

  // Ship
  const shipKeys = new Map();
  const shipX = (col) => num(geom.colCenter(col));
  const setKey = (sec, col) => shipKeys.set(pct(sec), shipX(col));
  setKey(0, plan.startCol);
  plan.shipMoves.forEach((m) => {
    setKey(m.start, m.from);
    setKey(m.end, m.to);
  });
  setKey(D, plan.startCol);
  const shipFrames = [...shipKeys.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([p, x]) => `${p}%{transform:translateX(${x}px)}`)
    .join('');
  css.push(`@keyframes sh{${shipFrames}}.sh{animation:sh ${num(D)}s ease-in-out infinite}`);
  body.push(
    `<g class="sh" transform="translate(${shipX(plan.startCol)} 0)"><use href="#ship" transform="translate(${-SHIP_W / 2} ${shipY})" fill="${pal.ship}"/></g>`
  );

  // Ground line
  body.push(
    `<rect x="${PAD}" y="${groundY}" width="${gridW}" height="1" fill="${pal.ship}" opacity=".35"/>`
  );

  // "Wave cleared" banner
  const c0 = Number(pct(plan.clearStart));
  const r0 = Number(respawnPct);
  css.push(
    `@keyframes wc{0%,${num(c0)}%{opacity:0}${num(Math.min(r0, c0 + 1))}%,${num(Math.max(c0, r0 - 1))}%{opacity:1}${num(r0)}%,100%{opacity:0}}` +
      `.wc{animation:wc ${num(D)}s linear infinite;font-size:13px;letter-spacing:3px}`
  );
  body.push(
    `<text class="wc" x="${width / 2}" y="${(GRID_TOP + gridBottom) / 2 + 4}" text-anchor="middle" opacity="0">WAVE CLEARED</text>`
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" ` +
    `aria-label="Animated contribution graph: a ship shoots down each day of contributions">` +
    `<style>${css.join('')}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>` +
    body.join('') +
    `</svg>`
  );
}

module.exports = { render, planTimeline, bitmapPath, PALETTES };

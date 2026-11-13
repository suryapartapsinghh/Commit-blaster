'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { render, planTimeline, bitmapPath } = require('../src/render');
const { demoData } = require('../src/demo');

test('renders a valid-looking SVG for demo data', () => {
  const data = demoData();
  const svg = render(data, { palette: 'dark' });
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  const targets = data.weeks.flat().filter((d) => d.level > 0).length;
  assert.strictEqual((svg.match(/@keyframes k\d+/g) || []).length, targets);
  assert.strictEqual((svg.match(/@keyframes b\d+/g) || []).length, targets);
});

test('handles a user with zero contributions', () => {
  const weeks = Array.from({ length: 53 }, () =>
    Array.from({ length: 7 }, (_, row) => ({ row, level: 0 }))
  );
  const svg = render({ weeks, total: 0 });
  assert.match(svg, /WAVE CLEARED/);
  assert.doesNotMatch(svg, /@keyframes k0/);
});

test('every bullet lands after it fires and before the wave clears', () => {
  const data = demoData(7);
  const cells = [];
  data.weeks.forEach((w, col) => w.forEach((d) => cells.push({ col, row: d.row, level: d.level })));
  const geom = { shipY: 160, cellY: (r) => 36 + r * 12 };
  const plan = planTimeline(cells, geom, 1);
  for (const s of plan.shots) {
    assert.ok(s.hit > s.fire);
    assert.ok(s.hit < plan.clearStart);
  }
  assert.ok(plan.respawnStart < plan.duration);
});

test('squares style and speed option work', () => {
  const svg = render(demoData(), { style: 'squares', speed: 2 });
  assert.doesNotMatch(svg, /id="a1"/);
});

test('bitmapPath merges horizontal runs', () => {
  assert.strictEqual(bitmapPath(['##.#'], 1), 'M0 0h2v1h-2zM3 0h1v1h-1z');
});

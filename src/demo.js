'use strict';

/** Generates a believable year of fake contributions, for previews and tests. */
function demoData(seed = 42, weeks = 53) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  let total = 0;
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const days = [];
    const lastDay = w === weeks - 1 ? 3 : 6; // final week is partial, like the real graph
    const busyWeek = rand() < 0.65;
    for (let d = 0; d <= lastDay; d++) {
      const weekend = d === 0 || d === 6;
      const chance = (busyWeek ? 0.75 : 0.25) * (weekend ? 0.45 : 1);
      let level = 0;
      if (rand() < chance) level = 1 + Math.floor(rand() * rand() * 4.2);
      level = Math.min(4, level);
      const count = level === 0 ? 0 : level * 3 + Math.floor(rand() * 3);
      total += count;
      days.push({ row: d, level, count });
    }
    out.push(days);
  }
  return { total, weeks: out };
}

module.exports = { demoData };

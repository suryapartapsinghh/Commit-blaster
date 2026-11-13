'use strict';

const fs = require('fs');
const path = require('path');
const { fetchContributions } = require('./github');
const { render } = require('./render');

const input = (name, fallback = '') =>
  (process.env[`INPUT_${name.toUpperCase()}`] || fallback).trim();

async function main() {
  const username = input('username');
  const token = input('github_token');
  const outDir = input('output_dir', 'dist');
  const style = input('style', 'aliens');
  const speed = Number(input('speed', '1'));

  const data = await fetchContributions(username, token);
  fs.mkdirSync(outDir, { recursive: true });

  const files = {
    'commit-blaster.svg': render(data, { palette: 'light', style, speed }),
    'commit-blaster-dark.svg': render(data, { palette: 'dark', style, speed }),
  };
  for (const [name, svg] of Object.entries(files)) {
    const file = path.join(outDir, name);
    fs.writeFileSync(file, svg);
    console.log(`Wrote ${file} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`${data.total} contributions turned into targets for @${username}.`);
}

main().catch((err) => {
  console.log(`::error::${err.message}`);
  process.exitCode = 1;
});

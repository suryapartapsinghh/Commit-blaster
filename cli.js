#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { render } = require('./src/render');
const { fetchContributions } = require('./src/github');
const { demoData } = require('./src/demo');

const HELP = `commit-blaster: turn a GitHub contribution graph into an animated retro shooter SVG

Usage:
  commit-blaster --user <name> [--token <token>] [options]
  commit-blaster --demo [options]

Options:
  --user <name>     GitHub username to render
  --token <token>   GitHub token (or set GITHUB_TOKEN)
  --demo            Use generated sample data instead of the API
  --out <dir>       Output directory (default: dist)
  --style <style>   aliens | squares (default: aliens)
  --speed <n>       Animation speed multiplier, 0.25 to 4 (default: 1)
  -h, --help        Show this help`;

function parseArgs(argv) {
  const args = { out: 'dist', style: 'aliens', speed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '--demo') args.demo = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.user && !args.demo)) {
    console.log(HELP);
    return;
  }

  const data = args.demo
    ? demoData()
    : await fetchContributions(args.user, args.token || process.env.GITHUB_TOKEN);

  fs.mkdirSync(args.out, { recursive: true });
  for (const palette of ['light', 'dark']) {
    const name = palette === 'dark' ? 'commit-blaster-dark.svg' : 'commit-blaster.svg';
    const svg = render(data, { palette, style: args.style, speed: Number(args.speed) });
    fs.writeFileSync(path.join(args.out, name), svg);
    console.log(`Wrote ${path.join(args.out, name)} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});

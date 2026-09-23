/* ============================================================
   One-time setup after `npm install`:  npm run setup
     1. installs the app under test's own dependencies (its
        Playwright test suite runs inside QNS as an agent)
     2. downloads the Chromium builds both Playwright versions need
     3. reports whether Claude Code is available for the in-app chat
   Safe to rerun. Paths come from server/config.mjs.
   ============================================================ */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG, ROOT } from '../server/config.mjs';

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`QNS needs Node.js 20 or newer (you have ${process.versions.node}).`);
  process.exit(1);
}

function step(title, cmd, args, cwd) {
  console.log(`\n▸ ${title}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\n✗ ${title} failed (exit ${r.status}). Fix the error above and rerun: npm run setup`);
    process.exit(r.status || 1);
  }
}

if (!existsSync(path.join(CONFIG.appPath, 'package.json'))) {
  console.error(`App under test not found at ${CONFIG.appPath}. Set appPath in qns.config.json (see README).`);
  process.exit(1);
}
if (!existsSync(path.join(CONFIG.designSystemDir, 'implementation', 'css', 'tokens.css'))) {
  console.error(`Design system not found at ${CONFIG.designSystemDir}. Set designSystemDir in qns.config.json.`);
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

step(`Installing the app under test's dependencies (${path.relative(ROOT, CONFIG.appPath) || '.'})`, npm, ['install'], CONFIG.appPath);
step('Downloading Chromium for QNS', npx, ['playwright', 'install', 'chromium'], ROOT);
step('Downloading Chromium for the app\'s test suite', npx, ['playwright', 'install', 'chromium'], CONFIG.appPath);

const claude = spawnSync(process.env.QNS_CLAUDE_BIN || 'claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
console.log('\n✓ Setup complete.');
console.log(claude.status === 0
  ? `  Claude chat: Claude Code ${claude.stdout.trim()} found — make sure you've signed in once by running \`claude\`.`
  : '  Claude chat: optional — install Claude Code (https://claude.com/claude-code) and sign in to use the Ask Claude buttons.');
console.log(`\n  Start QNS with:  npm start   →  http://localhost:${CONFIG.port}/\n`);

/* ============================================================
   Where QNS finds things, and which ports it serves on.

   Resolution order for every setting:
     1. environment variable (QNS_APP_PATH, QNS_DESIGN_SYSTEM_DIR,
        QNS_HOST, QNS_PORT, QNS_TARGET_PORT)
     2. qns.config.json in the project root — per machine, gitignored
        (see qns.config.example.json)
     3. defaults for the shared repo layout: ./comparinator and
        ./design-system next to this project, served on localhost only

   Relative paths resolve against the project root.
   ============================================================ */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT, 'qns.config.json');

let file = {};
if (existsSync(CONFIG_FILE)) {
  try { file = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); }
  catch (err) { throw new Error(`qns.config.json is not valid JSON: ${err.message}`); }
}

const pick = (envKey, fileKey, fallback) => process.env[envKey] || file[fileKey] || fallback;

export const CONFIG = {
  appPath: path.resolve(ROOT, pick('QNS_APP_PATH', 'appPath', 'comparinator')),
  designSystemDir: path.resolve(ROOT, pick('QNS_DESIGN_SYSTEM_DIR', 'designSystemDir', 'design-system')),
  // 127.0.0.1 keeps the cockpit (and its run controls) off the network by default;
  // set "::" to listen on every interface
  host: pick('QNS_HOST', 'host', '127.0.0.1'),
  port: Number(pick('QNS_PORT', 'port', 5177)),
  targetPort: Number(pick('QNS_TARGET_PORT', 'targetPort', 4173)),
};

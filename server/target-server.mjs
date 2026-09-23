/* Serves the app under test (see catalog.mjs APP_UNDER_TEST) on :4173 by default (config.mjs targetPort)
   as a separate process, so target availability is a real, observable
   fact — not an assumption. Run standalone or via the QNS
   server's target supervisor. */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_UNDER_TEST } from './catalog.mjs';
import { CONFIG } from './config.mjs';

const PORT = CONFIG.targetPort;
const ENTRY = APP_UNDER_TEST.entry || 'index.html';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = urlPath === '/' ? ENTRY : urlPath.slice(1);
  const file = path.normalize(path.join(APP_UNDER_TEST.path, rel));
  if (!file.startsWith(APP_UNDER_TEST.path)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, CONFIG.host, () => console.log(`[target] ${APP_UNDER_TEST.name} → http://localhost:${PORT}/`));

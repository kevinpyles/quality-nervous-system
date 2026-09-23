/* ============================================================
   QNS Service — cockpit host + quality API + live event stream.
     /               → ui/ (the cockpit)
     /design-system/ → the QNS Design System repo (tokens, css, icons)
     /evidence/      → captured run evidence
     /api/…          → health, target, catalog, runs, posture, actions
     /api/events     → SSE live stream
   ============================================================ */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';
import { APP_UNDER_TEST, AGENTS, PROOFS, COMPONENTS, TESTING_DIMENSIONS, CADENCES, MAP_NODES } from './catalog.mjs';
import { initStore, state, persist, EVIDENCE_DIR } from './store.mjs';
import { requestRun, summarizeRun, onEvent, emit, buildFingerprint, simulateDemoLoad } from './engine.mjs';
import { draftBugTicket, draftFixRequest } from './brain.mjs';
import { buildAppGraph } from './app-graph.mjs';
import { currentPosture } from './issues.mjs';
import {
  initChat, openIssueFor, listSessions, getSession, openSession, newGeneralSession,
  sendMessage, stopTurn, checkApply, applyProposal, undoLastApply, rerunIssue,
} from './chat.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(HERE, '..', 'ui');
const DESIGN_SYSTEM_DIR = CONFIG.designSystemDir;
const PORT = CONFIG.port;
const STARTED_AT = Date.now();

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.txt': 'text/plain', '.md': 'text/markdown',
};

/* ---------- target supervisor ---------- */
let targetProc = null;
function startTarget() {
  if (targetProc) return false;
  targetProc = spawn(process.execPath, [path.join(HERE, 'target-server.mjs')], { stdio: 'inherit' });
  targetProc.on('exit', () => { targetProc = null; emit('target-status', { up: false }); });
  return true;
}
function stopTarget() {
  if (!targetProc) return false;
  targetProc.kill();
  targetProc = null;
  return true;
}
async function probeTarget() {
  const t0 = Date.now();
  try {
    const res = await fetch(APP_UNDER_TEST.url, { signal: AbortSignal.timeout(1500) });
    return { up: res.ok, status: res.status, latencyMs: Date.now() - t0, url: APP_UNDER_TEST.url, supervised: !!targetProc };
  } catch {
    return { up: false, status: 0, latencyMs: null, url: APP_UNDER_TEST.url, supervised: !!targetProc };
  }
}

/* ---------- helpers ---------- */
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}
async function serveStatic(res, baseDir, rel, indexFile = 'index.html') {
  const file = path.normalize(path.join(baseDir, rel === '' || rel === '/' ? indexFile : rel));
  if (!file.startsWith(baseDir)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}

/* ---------- API router ---------- */
async function handleApi(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const route = seg.slice(1);

  // GET /api/health
  if (req.method === 'GET' && route[0] === 'health') {
    return json(res, 200, {
      service: 'qns', ok: true, uptimeMs: Date.now() - STARTED_AT,
      runsRecorded: state.runs.length,
      openActionRequests: state.actionRequests.filter((a) => a.state === 'open').length,
      build: await buildFingerprint(),
    });
  }
  // GET /api/target · POST /api/target/start|stop
  if (route[0] === 'target') {
    const isAction = req.method === 'POST' && (route[1] === 'start' || route[1] === 'stop');
    if (req.method === 'POST' && route[1] === 'start') { startTarget(); await new Promise((r) => setTimeout(r, 400)); }
    if (req.method === 'POST' && route[1] === 'stop') stopTarget();
    const probe = await probeTarget();
    if (isAction) emit('target-status', probe);
    return json(res, 200, probe);
  }
  // GET /api/catalog
  if (req.method === 'GET' && route[0] === 'catalog') {
    return json(res, 200, {
      app: APP_UNDER_TEST, agents: AGENTS, proofs: PROOFS,
      components: COMPONENTS, dimensions: TESTING_DIMENSIONS, cadences: CADENCES,
      mapNodes: MAP_NODES,
    });
  }
  // GET /api/coverage — per-component staleness (Requirements §Test run history)
  if (req.method === 'GET' && route[0] === 'coverage') {
    const now = Date.now();
    const FRESH_MS = 24 * 3600 * 1000;
    const AGING_MS = 72 * 3600 * 1000;
    const coverage = COMPONENTS.map((c) => {
      let latest = null;
      for (const r of state.runs) {
        if (r.status !== 'completed' || r.proof) continue;
        for (const s of (r.signals || [])) {
          if (s.component !== c.id) continue;
          if (!latest || new Date(s.createdAt) > new Date(latest.createdAt)) latest = s;
        }
      }
      if (!latest) {
        return { id: c.id, label: c.label, agentId: null, agentName: null, status: null, at: null, runId: null, ageMs: null, bucket: 'never' };
      }
      const ageMs = now - new Date(latest.createdAt).getTime();
      const bucket = ageMs < FRESH_MS ? 'fresh' : ageMs < AGING_MS ? 'aging' : 'stale';
      return { id: c.id, label: c.label, agentId: latest.agentId, agentName: latest.agentName, status: latest.status, at: latest.createdAt, runId: latest.runId, ageMs, bucket };
    });
    return json(res, 200, coverage);
  }
  // GET /api/graph — latest runtime UI graph captured by the Semantic Explorer agent
  if (req.method === 'GET' && route[0] === 'graph') {
    let latest = null;
    for (const r of state.runs) {
      if (r.status !== 'completed') continue;
      for (const s of (r.signals || [])) {
        if (s.agentId !== 'semantic-explorer' || !s.extra?.runtimeGraph) continue;
        if (!latest || new Date(s.createdAt) > new Date(latest.at)) latest = { runId: r.id, at: s.createdAt, graph: s.extra.runtimeGraph };
      }
    }
    return json(res, 200, latest || { runId: null, at: null, graph: null });
  }
  // GET /api/app-graph — components + discovered controls + coverage edges,
  // bugs, automation type, and perf/visual-diff hotspots, fused for the
  // cockpit's two-tier app graph panel.
  if (req.method === 'GET' && route[0] === 'app-graph') {
    const graph = buildAppGraph(state);
    // open blocker/warning per component (live or labeled controlled proof)
    // — drives the red/amber node and its AI agent icon on the map
    for (const c of graph.components) c.issue = openIssueFor(c.id);
    return json(res, 200, graph);
  }
  // /api/chat/… — the cockpit's Claude chat (see chat.mjs)
  if (route[0] === 'chat') return handleChat(req, res, route);
  // GET /api/runs · GET /api/runs/:id · POST /api/runs
  if (route[0] === 'runs') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      try {
        const run = await requestRun(body);
        return json(res, 201, summarizeRun(run));
      } catch (err) { return json(res, 400, { error: err.message }); }
    }
    if (route[1]) {
      const run = state.runs.find((r) => r.id === route[1]);
      return run ? json(res, 200, run) : json(res, 404, { error: 'no such run' });
    }
    const q = url.searchParams;
    let runs = state.runs;
    if (q.get('cadence')) runs = runs.filter((r) => r.cadence === q.get('cadence'));
    if (q.get('context') === 'proof') runs = runs.filter((r) => r.proof);
    if (q.get('context') === 'live') runs = runs.filter((r) => !r.proof);
    return json(res, 200, runs.slice(0, 60).map(summarizeRun));
  }
  // GET /api/posture — app-wide posture rolled up from every component's
  // latest check (issues.mjs), plus the briefing for the worst open issue
  if (req.method === 'GET' && route[0] === 'posture') {
    const { runId, issue, ...decision } = currentPosture(state);
    if (decision.posture === 'UNKNOWN') return json(res, 200, { ...decision, run: null, briefing: null });
    const run = state.runs.find((r) => r.id === runId);
    const finding = issue ? run?.findings?.find((f) => f.id === issue.findingId) : null;
    const ar = finding ? state.actionRequests.find((a) => a.findingId === finding.id) : null;
    return json(res, 200, {
      ...decision,
      run: run ? summarizeRun(run) : null,
      briefing: finding && {
        finding,
        actionRequest: ar || null,
        signals: run.signals.filter((s) => finding.signals.includes(s.id)),
      },
    });
  }
  // GET /api/action-requests · POST /api/action-requests/:id/action
  if (route[0] === 'action-requests') {
    if (req.method === 'GET') return json(res, 200, state.actionRequests.slice(0, 80));
    if (req.method === 'POST' && route[1] && route[2] === 'action') {
      const ar = state.actionRequests.find((a) => a.id === route[1]);
      if (!ar) return json(res, 404, { error: 'no such action request' });
      const { type, note } = await readBody(req);
      const run = state.runs.find((r) => r.id === ar.runId);
      const stamp = { at: new Date().toISOString(), event: type, by: 'human', note: note || null };
      switch (type) {
        case 'bug-draft': {
          const draft = draftBugTicket(ar, run);
          state.artifacts.unshift(draft);
          ar.state = 'bug-drafted'; ar.history.push(stamp);
          await persist(); emit('artifact', { kind: draft.kind, id: draft.id });
          return json(res, 201, draft);
        }
        case 'fix-request': {
          const draft = draftFixRequest(ar, run);
          state.artifacts.unshift(draft);
          ar.state = 'fix-requested'; ar.history.push(stamp);
          await persist(); emit('artifact', { kind: draft.kind, id: draft.id });
          return json(res, 201, draft);
        }
        case 'rerun': {
          ar.state = 'rerun-queued'; ar.history.push(stamp);
          await persist();
          const rerun = await requestRun({ scope: { type: 'rerun-failed', value: ar.runId }, cadence: run?.cadence || 'ad-hoc', trigger: 'manual-ui' });
          return json(res, 201, summarizeRun(rerun));
        }
        case 'accept-risk': {
          ar.state = 'risk-accepted'; ar.ownerType = 'human'; ar.history.push(stamp);
          await persist(); emit('action-request-updated', { id: ar.id, state: ar.state });
          return json(res, 200, ar);
        }
        case 'dismiss': {
          ar.state = 'dismissed'; ar.history.push(stamp);
          await persist(); emit('action-request-updated', { id: ar.id, state: ar.state });
          return json(res, 200, ar);
        }
        default: return json(res, 400, { error: `unknown action ${type}` });
      }
    }
  }
  // POST /api/demo/simulate — visual-only pulse flood for live demos; see
  // engine.mjs#simulateDemoLoad for why this can never touch real run state
  if (req.method === 'POST' && route[0] === 'demo' && route[1] === 'simulate') {
    const body = await readBody(req);
    return json(res, 200, simulateDemoLoad(body.count));
  }
  // GET /api/artifacts
  if (req.method === 'GET' && route[0] === 'artifacts') {
    return json(res, 200, state.artifacts.slice(0, 60));
  }
  // GET /api/events — SSE
  if (req.method === 'GET' && route[0] === 'events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', at: new Date().toISOString() })}\n\n`);
    const off = onEvent((evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`));
    const beat = setInterval(() => res.write(`data: ${JSON.stringify({ type: 'heartbeat', at: new Date().toISOString() })}\n\n`), 5000);
    req.on('close', () => { off(); clearInterval(beat); });
    return;
  }
  json(res, 404, { error: 'no such endpoint' });
}

/* ---------- Claude chat ----------
   Chat turns run Claude Code on this machine, so they are only served
   to the local browser — never to anyone else on the network. */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

async function handleChat(req, res, route) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return json(res, 403, { error: 'chat is only available from this machine' });
  if (route[1] !== 'sessions') return json(res, 404, { error: 'no such endpoint' });

  if (!route[2]) {
    if (req.method === 'GET') return json(res, 200, listSessions());
    if (req.method === 'POST') {
      const body = await readBody(req);
      const s = body.fresh ? await newGeneralSession() : await openSession({ componentId: body.componentId || null });
      return json(res, 200, s);
    }
  }
  const s = getSession(route[2]);
  if (!s) return json(res, 404, { error: 'no such chat' });
  if (req.method === 'GET' && !route[3]) return json(res, 200, s);
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

  const body = await readBody(req);
  try {
    switch (route[3]) {
      case 'messages': await sendMessage(s, body.text); return json(res, 202, s);
      case 'stop': stopTurn(s); return json(res, 200, s);
      case 'apply': checkApply(s, body.messageId); applyProposal(s, body.messageId).catch((err) => console.error('[chat] apply', err)); return json(res, 202, s);
      case 'undo': await undoLastApply(s); return json(res, 200, s);
      case 'rerun': await rerunIssue(s); return json(res, 200, s);
      default: return json(res, 404, { error: 'no such endpoint' });
    }
  } catch (err) {
    return json(res, 409, { error: err.message });
  }
}

/* ---------- boot ---------- */
await initStore();
await initChat();
startTarget();

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/design-system/')) {
      return await serveStatic(res, DESIGN_SYSTEM_DIR, decodeURIComponent(url.pathname.slice('/design-system/'.length)));
    }
    if (url.pathname.startsWith('/evidence/')) {
      return await serveStatic(res, EVIDENCE_DIR, decodeURIComponent(url.pathname.slice('/evidence/'.length)));
    }
    return await serveStatic(res, UI_DIR, decodeURIComponent(url.pathname.slice(1)));
  } catch (err) {
    console.error('[server]', err);
    res.writeHead(500); res.end('server error');
  }
}).listen(PORT, CONFIG.host, () => {
  console.log(`[qns] cockpit → http://localhost:${PORT}/`);
  console.log(`[qns] target supervisor started for ${APP_UNDER_TEST.name}`);
});

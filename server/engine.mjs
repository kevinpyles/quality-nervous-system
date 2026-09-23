/* ============================================================
   QNS Engine — run orchestration: queue, execute agents with
   Playwright, capture evidence, hand results to the brain,
   emit live events. (Requirements §Test orchestration)
   ============================================================ */

import { chromium } from 'playwright';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { APP_UNDER_TEST, AGENTS, PROOFS, COMPONENTS } from './catalog.mjs';
import { AGENT_IMPLS, SABOTAGES } from './agents.mjs';
import { normalizeSignal, synthesize, decidePosture, buildActionRequests, applySupersession, computePerfTrend } from './brain.mjs';
import { state, persist, evidenceDirFor, EVIDENCE_DIR } from './store.mjs';
import { identifyControl, controlKey } from './control-identity.mjs';

/* ---------- coverage instrumentation: which real controls did this
   agent actually touch? Wraps the interaction methods agents call
   (verified against agents.mjs: click/fill/setChecked/check, plus
   keyboard activation) and resolves each touched element with the
   SAME identity rule runSemanticExplorer uses to discover controls,
   so the two can be joined later. Never lets a resolution failure
   fail the agent — it's purely additive telemetry. ---------- */
const INTERACTION_METHODS = ['click', 'fill', 'check', 'setChecked'];

function instrumentCoverage(page) {
  const touched = new Map(); // controlKey -> { ...identity, count }
  const record = (identity) => {
    if (!identity) return;
    const key = controlKey(identity);
    if (!key) return;
    const existing = touched.get(key);
    if (existing) existing.count += 1;
    else touched.set(key, { ...identity, count: 1 });
  };

  for (const method of INTERACTION_METHODS) {
    const original = page[method].bind(page);
    page[method] = async (selector, ...rest) => {
      const result = await original(selector, ...rest);
      try { record(await page.$eval(selector, identifyControl)); } catch { /* element gone; skip */ }
      return result;
    };
  }

  // page.keyboard.press('Enter'|' ') is how keyboard-access "clicks" the
  // Compare button — its only interaction path is never page.click. Tab is
  // deliberately excluded (pure navigation, would flood ~20 stops/run with
  // no real "touch"). Identity is resolved from document.activeElement
  // BEFORE the press fires, since activation can move focus immediately.
  const originalPress = page.keyboard.press.bind(page.keyboard);
  page.keyboard.press = async (key, ...rest) => {
    let activeHandle = null;
    if (key === 'Enter' || key === ' ') {
      try { activeHandle = await page.evaluateHandle(() => document.activeElement); } catch { /* ignore */ }
    }
    const result = await originalPress(key, ...rest);
    if (activeHandle) {
      try { record(await page.evaluate(identifyControl, activeHandle)); } catch { /* ignore */ }
      await activeHandle.dispose().catch(() => {});
    }
    return result;
  };

  return () => [...touched.values()];
}

const DEFAULT_VIEWPORT = { width: 1280, height: 860 };

/* ---------- visual regression: diff each screenshot against the last
   passing run's same agent+label screenshot ---------- */
const VISUAL_DIFF_EVIDENCE_PCT = 1.5;

function findScreenshotBaseline(runs, currentRunId, agentId, label) {
  const candidates = runs
    .filter((r) => r.id !== currentRunId && r.status === 'completed' && !r.proof)
    .sort((a, b) => new Date(b.finishedAt || 0) - new Date(a.finishedAt || 0));
  for (const r of candidates) {
    const sig = (r.signals || []).find((s) => s.agentId === agentId && s.status === 'pass');
    if (!sig) continue;
    const ev = (sig.evidence || []).find((e) => e.type === 'screenshot' && e.label === label);
    if (ev) return { runId: r.id, relPath: ev.path };
  }
  return null;
}

async function diffScreenshotAgainstBaseline({ runId, agentId, label, currentAbsPath, evidenceDir }) {
  const baseline = findScreenshotBaseline(state.runs, runId, agentId, label);
  if (!baseline) return null;
  try {
    const baselineAbsPath = path.join(EVIDENCE_DIR, baseline.relPath.replace(/^\/evidence\//, ''));
    const [curBuf, baseBuf] = await Promise.all([readFile(currentAbsPath), readFile(baselineAbsPath)]);
    const cur = PNG.sync.read(curBuf);
    const base = PNG.sync.read(baseBuf);
    if (cur.width !== base.width || cur.height !== base.height) return null;
    const diff = new PNG({ width: cur.width, height: cur.height });
    const numDiff = pixelmatch(cur.data, base.data, diff.data, cur.width, cur.height, { threshold: 0.1 });
    const diffPct = Math.round((numDiff / (cur.width * cur.height)) * 10000) / 100;
    if (diffPct < VISUAL_DIFF_EVIDENCE_PCT) return null;
    const diffFile = `${agentId}-${label}-diff.png`;
    await writeFile(path.join(evidenceDir, diffFile), PNG.sync.write(diff));
    return {
      type: 'visual-diff', label: `${label} vs ${baseline.runId}`,
      path: `/evidence/${runId}/${diffFile}`, diffPct, baselineRunId: baseline.runId,
    };
  } catch { return null; }
}

const uid = (p) => `${p}-${randomUUID().slice(0, 8)}`;

/* ---------- live event bus (fans out to SSE clients) ---------- */
const listeners = new Set();
export function onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(type, payload) {
  const evt = { type, at: new Date().toISOString(), ...payload };
  for (const fn of listeners) { try { fn(evt); } catch { /* client gone */ } }
}

/* ---------- build fingerprint of the app under test ---------- */
export async function buildFingerprint() {
  const files = [APP_UNDER_TEST.entry || 'index.html'];
  const hash = createHash('sha256');
  for (const f of files) {
    try { hash.update(await readFile(path.join(APP_UNDER_TEST.path, f))); }
    catch { hash.update('missing:' + f); }
  }
  const fingerprint = hash.digest('hex').slice(0, 12);
  return { fingerprint, label: `${APP_UNDER_TEST.buildTag || APP_UNDER_TEST.id}@${fingerprint.slice(0, 7)}` };
}

/* ---------- demo pulse simulation (visual only) ----------
   For live demos of the map at volume. Emits `demo-pulse` SSE events —
   a type distinct from every real event ('agent-started', 'run-finished',
   etc.) so it can never be mistaken for one: it creates no run, no signal,
   no evidence, no posture change, and the UI's real-data refresh/toast
   logic (ui/js/api.js) doesn't recognize it and ignores it. Only the map
   (ui/js/map2d.js) listens for it, to draw pulses. Nothing here is
   persisted — see Requirements.md and [[qns-truthful-motion]] on why the
   real event stream must never be fabricated. */
let demoRunning = false;
const DEMO_MAX_COUNT = 5000;
const DEMO_COMPONENT_IDS = COMPONENTS.map((c) => c.id);

export function simulateDemoLoad(requestedCount) {
  if (demoRunning) return { started: false, reason: 'a demo simulation is already running' };
  const count = Math.max(1, Math.min(DEMO_MAX_COUNT, Math.floor(requestedCount) || 1000));
  // spread the flood over time rather than firing all at once. Each demo
  // tick keeps ~3 pulses alive on the map for ~2.2s (start + finish, see
  // below), so packing ticks closer than ~30ms apart pushes concurrent
  // live pulses past what the map can draw smoothly — that's what froze
  // it at the default count of 1000. The map also hard-caps concurrent
  // pulses as a safety net (ui/js/map2d.js#MAX_PULSES), but pacing here
  // keeps it from ever needing to.
  const totalMs = Math.min(45000, Math.max(3000, count * 30));

  demoRunning = true;
  emit('demo-started', { count, estimatedMs: totalMs });
  let started = 0;
  const scheduleNext = () => {
    if (started >= count) {
      demoRunning = false;
      emit('demo-finished', { count });
      return;
    }
    started += 1;
    const component = DEMO_COMPONENT_IDS[Math.floor(Math.random() * DEMO_COMPONENT_IDS.length)];
    emit('demo-pulse', { phase: 'start', component });
    setTimeout(() => {
      const r = Math.random();
      const status = r < 0.03 ? 'fail' : r < 0.10 ? 'degraded' : 'pass';
      emit('demo-pulse', { phase: 'finish', component, status });
    }, 120 + Math.random() * 260);
    setTimeout(scheduleNext, (totalMs / count) * (0.4 + Math.random() * 1.2));
  };
  scheduleNext();
  return { started: true, count, estimatedMs: totalMs };
}

/* ---------- scope resolution ---------- */
export function resolveAgents(scope) {
  const all = AGENTS;
  switch (scope?.type) {
    case 'all': return all;
    case 'cadence': return all.filter((a) => a.cadences.includes(scope.value));
    case 'dimension': return all.filter((a) => a.category === scope.value);
    case 'component': return all.filter((a) => a.component === scope.value);
    case 'agent': return all.filter((a) => a.id === scope.value);
    case 'rerun-failed': {
      const failedComponents = new Set();
      const src = state.runs.find((r) => r.id === scope.value);
      for (const s of (src?.signals || [])) {
        if (s.status === 'fail' || s.status === 'degraded') failedComponents.add(s.agentId);
      }
      return all.filter((a) => failedComponents.has(a.id));
    }
    default: return all.filter((a) => a.cadences.includes('build-smoke'));
  }
}

/* ---------- run execution ---------- */
let running = false;
const queue = [];

export async function requestRun({ scope, cadence = 'ad-hoc', trigger = 'manual-ui', proof = null }) {
  const proofDef = proof ? PROOFS.find((p) => p.id === proof) : null;
  if (proof && !proofDef) throw new Error(`Unknown proof scenario: ${proof}`);
  const agents = proofDef
    ? AGENTS.filter((a) => a.id === proofDef.agent)
    : resolveAgents(scope);
  if (!agents.length) throw new Error('Scope resolves to zero agents');

  const run = {
    id: uid('run'),
    app: APP_UNDER_TEST.name,
    build: await buildFingerprint(),
    environment: 'local',
    cadence,
    trigger,                 // manual-ui | ai-requested | ci | scheduled | release-gate
    scope: proofDef ? { type: 'proof', value: proofDef.id } : (scope || { type: 'cadence', value: 'build-smoke' }),
    proof: proofDef?.id || null,
    proofName: proofDef?.name || null,
    status: 'queued',        // queued | running | completed | failed | cancelled | stale
    agentPlan: agents.map((a) => a.id),
    agentExecutions: [],
    signals: [],
    findings: [],
    decision: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    createdAt: new Date().toISOString(),
  };
  state.runs.unshift(run);
  await persist();
  emit('run-queued', { runId: run.id, run: summarizeRun(run) });
  queue.push(run.id);
  drainQueue();
  return run;
}

async function drainQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const runId = queue.shift();
    const run = state.runs.find((r) => r.id === runId);
    if (!run || run.status === 'cancelled') continue;
    try { await executeRun(run); }
    catch (err) {
      run.status = 'failed';
      run.error = err.message;
      run.finishedAt = new Date().toISOString();
      emit('run-finished', { runId: run.id, run: summarizeRun(run) });
      await persist();
    }
  }
  running = false;
}

/* ---------- run a single agent once (used for the primary attempt and,
   on failure, one flakiness-confirmation retry) ---------- */
async function runAgentOnce({ browser, agentDef, proofDef, evidenceDir, runId, cadence, labelSuffix = '', enableDiff = true }) {
  const context = await browser.newContext({ viewport: agentDef.viewport || DEFAULT_VIEWPORT });
  if (proofDef) await context.addInitScript(SABOTAGES[proofDef.sabotage]);
  const page = await context.newPage();

  const consoleLog = [];
  page.on('console', (msg) => consoleLog.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleLog.push(`[pageerror] ${err.message}`));

  const getTouchedControls = instrumentCoverage(page);

  const evidence = [];
  const ctx = {
    page,
    context,
    targetUrl: APP_UNDER_TEST.url,
    cadence,
    saveEvidence: async (type, label) => {
      const file = `${agentDef.id}${labelSuffix}-${label}.png`;
      const absPath = path.join(evidenceDir, file);
      await page.screenshot({ path: absPath, fullPage: true });
      evidence.push({ type: 'screenshot', label, path: `/evidence/${runId}/${file}` });
      if (enableDiff) {
        const diffEntry = await diffScreenshotAgainstBaseline({ runId, agentId: agentDef.id, label, currentAbsPath: absPath, evidenceDir });
        if (diffEntry) evidence.push(diffEntry);
      }
    },
    attachNote: async (type, name, body) => {
      const file = `${agentDef.id}${labelSuffix}-${name}`;
      await writeFile(path.join(evidenceDir, file), body);
      evidence.push({ type, label: name, path: `/evidence/${runId}/${file}` });
    },
  };

  let result;
  const t0 = Date.now();
  try {
    result = await AGENT_IMPLS[agentDef.executable](ctx);
  } catch (err) {
    result = {
      status: 'fail',
      finding: `Agent crashed: ${err.message.split('\n')[0]}`,
      impact: 'The check could not complete; coverage for this component is unknown.',
      recommendedAction: 'Inspect the agent error and the target; rerun after fixing.',
      details: [err.stack?.split('\n').slice(0, 4).join(' | ') || ''],
      confidence: 0.6,
    };
  }
  if (consoleLog.length) await ctx.attachNote('log', 'console.log.txt', consoleLog.join('\n'));
  const touchedControls = getTouchedControls();
  await context.close();

  return { result, evidence, durationMs: Date.now() - t0, touchedControls };
}

async function executeRun(run) {
  run.status = 'running';
  run.startedAt = new Date().toISOString();
  emit('run-started', { runId: run.id, run: summarizeRun(run) });
  await persist();

  const proofDef = run.proof ? PROOFS.find((p) => p.id === run.proof) : null;
  const evidenceDir = await evidenceDirFor(run.id);
  const browser = await chromium.launch({ headless: true });
  const signalsById = new Map();

  try {
    for (const agentDef of run.agentPlan.map((id) => AGENTS.find((a) => a.id === id))) {
      const exec = {
        agentId: agentDef.id,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationMs: null,
      };
      run.agentExecutions.push(exec);
      emit('agent-started', { runId: run.id, agentId: agentDef.id });

      let { result, evidence, durationMs, touchedControls } = await runAgentOnce({ browser, agentDef, proofDef, evidenceDir, runId: run.id, cadence: run.cadence });

      // Flakiness confirmation: a fresh, immediate retry of a fail/degraded
      // result (skipped for controlled proofs, whose "failure" is deliberate).
      let flaky = false;
      if (!proofDef && (result.status === 'fail' || result.status === 'degraded')) {
        const retry = await runAgentOnce({ browser, agentDef, proofDef: null, evidenceDir, runId: run.id, cadence: run.cadence, labelSuffix: '-retry', enableDiff: false });
        durationMs += retry.durationMs;
        if (retry.result.status === 'pass') {
          flaky = true;
          result = { ...result, details: [...(result.details || []), `Retry immediately after: PASSED (${retry.result.finding})`] };
          evidence = [...evidence, ...retry.evidence];
        } else {
          result = { ...result, details: [...(result.details || []), `Retry immediately after: still ${retry.result.status}.`] };
        }
        // Merge touched controls from the retry — real re-exercise of the
        // same controls, not noise (same rationale as merging evidence).
        const merged = new Map(touchedControls.map((c) => [controlKey(c), c]));
        for (const c of retry.touchedControls) {
          const key = controlKey(c);
          const existing = merged.get(key);
          if (existing) existing.count += c.count;
          else merged.set(key, { ...c });
        }
        touchedControls = [...merged.values()];
      }

      exec.status = result.status;
      exec.finishedAt = new Date().toISOString();
      exec.durationMs = durationMs;
      exec.flaky = flaky;
      exec.riskScore = result.status === 'fail' ? (agentDef.severityOnFail === 'blocker' ? 85 : 60)
        : result.status === 'degraded' ? 35 : 8;

      const signal = normalizeSignal(run, agentDef, result, evidence, { flaky, controlsTouched: touchedControls });
      if (agentDef.id === 'perf-timing') {
        signal.perfTrend = computePerfTrend(agentDef.id, agentDef.component, state.runs, signal.extra);
      }
      run.signals.push(signal);
      signalsById.set(signal.id, signal);
      emit('agent-finished', { runId: run.id, agentId: agentDef.id, status: result.status, signalId: signal.id, flaky });
      await persist();
    }

    /* ---- brain synthesis ---- */
    run.findings = synthesize(run, run.signals, state.runs);
    run.decision = decidePosture(run, run.signals, run.findings);
    const newARs = buildActionRequests(run, run.findings, signalsById);
    state.actionRequests.unshift(...newARs);
    state.decisions.unshift({ runId: run.id, ...run.decision });

    run.status = 'completed';
    run.finishedAt = new Date().toISOString();
    run.durationMs = new Date(run.finishedAt) - new Date(run.startedAt);
    // supersession must see this run as completed to count it as the newest evidence
    applySupersession(state.runs, state.actionRequests);
    emit('run-finished', { runId: run.id, run: summarizeRun(run), posture: run.decision.posture });
    if (newARs.length) emit('action-requests', { runId: run.id, count: newARs.length });
    await persist();
  } finally {
    await browser.close();
  }
}

export function summarizeRun(run) {
  return {
    id: run.id, app: run.app, build: run.build, environment: run.environment,
    cadence: run.cadence, trigger: run.trigger, scope: run.scope,
    proof: run.proof, proofName: run.proofName, status: run.status,
    counts: run.decision?.counts || {
      pass: run.signals.filter((s) => s.status === 'pass').length,
      fail: run.signals.filter((s) => s.status === 'fail').length,
      degraded: run.signals.filter((s) => s.status === 'degraded').length,
      total: run.agentPlan.length,
    },
    posture: run.decision?.posture || null,
    agentPlan: run.agentPlan,
    agentExecutions: run.agentExecutions,
    startedAt: run.startedAt, finishedAt: run.finishedAt, durationMs: run.durationMs,
    createdAt: run.createdAt, error: run.error || null,
  };
}

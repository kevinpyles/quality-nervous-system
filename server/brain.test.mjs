/* ============================================================
   Unit tests for the QNS brain — the release-gating decision
   logic (normalize, cluster/history, decide, act, supersede).
   Pure-function tests: no Playwright, no server, no filesystem.
   Run with: npm test  (node --test server/)
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSignal, synthesize, decidePosture, buildActionRequests,
  applySupersession, computePerfTrend, isSubsetPass,
} from './brain.mjs';

function makeRun(overrides = {}) {
  return {
    id: 'run-1',
    app: 'Comparinator V13',
    build: { fingerprint: 'abc123', label: 'v13@abc123' },
    environment: 'local',
    cadence: 'ad-hoc',
    proof: null,
    scope: { type: 'agent', value: 'flow-compare' },
    status: 'completed',
    finishedAt: new Date().toISOString(),
    signals: [],
    ...overrides,
  };
}

function makeAgentDef(overrides = {}) {
  return {
    id: 'flow-compare',
    name: 'Compare Flow Agent',
    category: 'functional',
    role: 'checker',
    component: 'compare-flow',
    severityOnFail: 'blocker',
    ...overrides,
  };
}

/* ---------- normalizeSignal ---------- */

test('normalizeSignal: fail maps to the agent\'s severityOnFail and escalates to human', () => {
  const sig = normalizeSignal(makeRun(), makeAgentDef(), {
    status: 'fail', finding: 'broke', impact: 'bad', recommendedAction: 'fix', confidence: 0.9, details: ['a'],
  }, []);
  assert.equal(sig.severity, 'blocker');
  assert.equal(sig.ownerType, 'human');
  assert.equal(sig.flaky, false);
  assert.equal(sig.extra, null);
});

test('normalizeSignal: degraded -> advisory/system, pass -> info/system, extra passes through', () => {
  const degraded = normalizeSignal(makeRun(), makeAgentDef(), {
    status: 'degraded', finding: 'f', impact: 'i', recommendedAction: 'r', confidence: 0.7,
  }, []);
  assert.equal(degraded.severity, 'advisory');
  assert.equal(degraded.ownerType, 'system');

  const passed = normalizeSignal(makeRun(), makeAgentDef(), {
    status: 'pass', finding: 'f', impact: 'i', recommendedAction: 'r', confidence: 0.95, extra: { bootMs: 100 },
  }, []);
  assert.equal(passed.severity, 'info');
  assert.equal(passed.ownerType, 'system');
  assert.deepEqual(passed.extra, { bootMs: 100 });
});

test('normalizeSignal: carries the flaky flag from meta', () => {
  const sig = normalizeSignal(makeRun(), makeAgentDef(), {
    status: 'fail', finding: 'f', impact: 'i', recommendedAction: 'r', confidence: 0.5,
  }, [], { flaky: true });
  assert.equal(sig.flaky, true);
});

/* ---------- computePerfTrend ---------- */

test('computePerfTrend: null with fewer than 2 prior samples', () => {
  assert.equal(computePerfTrend('perf-timing', 'perf', [], { compareMs: 1000 }), null);
  const oneRun = [{ status: 'completed', proof: null, signals: [{ agentId: 'perf-timing', component: 'perf', extra: { compareMs: 900 }, createdAt: '2026-01-01T00:00:00Z' }] }];
  assert.equal(computePerfTrend('perf-timing', 'perf', oneRun, { compareMs: 1000 }), null);
});

test('computePerfTrend: classifies regression / stable / improvement against the trailing baseline', () => {
  const history = [
    { status: 'completed', proof: null, signals: [{ agentId: 'perf-timing', component: 'perf', extra: { compareMs: 1000 }, createdAt: '2026-01-01T00:00:00Z' }] },
    { status: 'completed', proof: null, signals: [{ agentId: 'perf-timing', component: 'perf', extra: { compareMs: 1000 }, createdAt: '2026-01-02T00:00:00Z' }] },
  ];
  assert.equal(computePerfTrend('perf-timing', 'perf', history, { compareMs: 1500 }).trend, 'regression'); // +50%
  assert.equal(computePerfTrend('perf-timing', 'perf', history, { compareMs: 1050 }).trend, 'stable');      // +5%
  assert.equal(computePerfTrend('perf-timing', 'perf', history, { compareMs: 700 }).trend, 'improvement');  // -30%
});

test('computePerfTrend: ignores controlled-proof runs and non-completed runs', () => {
  const history = [
    { status: 'completed', proof: 'proof-x', signals: [{ agentId: 'perf-timing', component: 'perf', extra: { compareMs: 5000 }, createdAt: '2026-01-01T00:00:00Z' }] },
    { status: 'running', proof: null, signals: [{ agentId: 'perf-timing', component: 'perf', extra: { compareMs: 5000 }, createdAt: '2026-01-02T00:00:00Z' }] },
  ];
  assert.equal(computePerfTrend('perf-timing', 'perf', history, { compareMs: 1000 }), null);
});

/* ---------- synthesize ---------- */

test('synthesize: a failing signal becomes a finding with the right severity and a "first observed" note', () => {
  const run = makeRun();
  const sig = normalizeSignal(run, makeAgentDef(), {
    status: 'fail', finding: 'Compare broke', impact: 'bad', recommendedAction: 'fix it', confidence: 0.9, details: [],
  }, []);
  const findings = synthesize(run, [sig], []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocker');
  assert.match(findings[0].historyNote, /First observed failure/);
});

test('synthesize: a flaky failure gets its own history note instead of "new" or "inherited"', () => {
  const run = makeRun();
  const sig = normalizeSignal(run, makeAgentDef(), {
    status: 'fail', finding: 'Compare broke', impact: 'bad', recommendedAction: 'fix it', confidence: 0.9, details: [],
  }, [], { flaky: true });
  const findings = synthesize(run, [sig], []);
  assert.match(findings[0].historyNote, /flaky/i);
});

test('synthesize: a controlled-proof failure is labeled as seeded, not a real regression', () => {
  const run = makeRun({ proof: 'proof-blocked-action' });
  const sig = normalizeSignal(run, makeAgentDef(), {
    status: 'fail', finding: 'seeded', impact: 'bad', recommendedAction: 'n/a', confidence: 0.9, details: [],
  }, []);
  const findings = synthesize(run, [sig], []);
  assert.match(findings[0].historyNote, /Controlled proof/);
});

test('synthesize: a failure that also failed in prior runs is flagged inherited, not new', () => {
  const priorRun = makeRun({
    id: 'run-0', status: 'completed', finishedAt: '2026-01-01T00:00:00Z',
    signals: [{ component: 'compare-flow', status: 'fail', agentId: 'flow-compare' }],
  });
  const run = makeRun({ id: 'run-1' });
  const sig = normalizeSignal(run, makeAgentDef(), {
    status: 'fail', finding: 'still broken', impact: 'bad', recommendedAction: 'fix', confidence: 0.9, details: [],
  }, []);
  const findings = synthesize(run, [sig], [priorRun]);
  assert.match(findings[0].historyNote, /inherited/);
});

test('synthesize: a perf-trend regression produces an advisory finding even though the signal passed', () => {
  const run = makeRun();
  const perfAgent = makeAgentDef({ id: 'perf-timing', name: 'Performance Timing Agent', component: 'perf', category: 'performance', severityOnFail: 'advisory' });
  const sig = normalizeSignal(run, perfAgent, {
    status: 'pass', finding: 'ok', impact: 'ok', recommendedAction: 'None.', confidence: 0.85, extra: { compareMs: 2000 },
  }, []);
  sig.perfTrend = { trend: 'regression', deltaPct: 60, currentMs: 2000, baselineMs: 1250, sampleCount: 3 };
  const findings = synthesize(run, [sig], []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'advisory');
  assert.equal(findings[0].status, 'pass');
  assert.match(findings[0].title, /Performance trending worse/);
});

test('synthesize: a significant visual diff on a passing signal produces an advisory finding', () => {
  const run = makeRun();
  const sig = normalizeSignal(run, makeAgentDef(), {
    status: 'pass', finding: 'ok', impact: 'ok', recommendedAction: 'None.', confidence: 0.9,
  }, [
    { type: 'screenshot', label: 'compare-result', path: '/evidence/run-1/x.png' },
    { type: 'visual-diff', label: 'compare-result vs run-0', path: '/evidence/run-1/x-diff.png', diffPct: 8.2, baselineRunId: 'run-0' },
  ]);
  const findings = synthesize(run, [sig], []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'advisory');
  assert.match(findings[0].title, /Visual regression/);
});

test('synthesize: a small visual diff stays below the finding threshold', () => {
  const run = makeRun();
  const sig = normalizeSignal(run, makeAgentDef(), {
    status: 'pass', finding: 'ok', impact: 'ok', recommendedAction: 'None.', confidence: 0.9,
  }, [
    { type: 'visual-diff', label: 'compare-result vs run-0', path: '/x', diffPct: 2.0, baselineRunId: 'run-0' },
  ]);
  assert.equal(synthesize(run, [sig], []).length, 0);
});

/* ---------- decidePosture ---------- */

test('decidePosture: no signals -> UNKNOWN', () => {
  assert.equal(decidePosture(makeRun(), [], []).posture, 'UNKNOWN');
});

test('decidePosture: a blocker finding -> NO-GO, escalated to a human', () => {
  const d = decidePosture(makeRun(), [{ status: 'fail' }], [{ severity: 'blocker', component: 'compare-flow', confidence: 0.9 }]);
  assert.equal(d.posture, 'NO-GO');
  assert.equal(d.escalated, true);
  assert.equal(d.ownerType, 'human');
});

test('decidePosture: warnings only -> CONDITIONAL', () => {
  const d = decidePosture(makeRun(), [{ status: 'degraded' }], [{ severity: 'warning', component: 'export', confidence: 0.8 }]);
  assert.equal(d.posture, 'CONDITIONAL');
});

test('decidePosture: advisories only -> GO, system-owned (not escalated)', () => {
  const d = decidePosture(makeRun(), [{ status: 'pass' }], [{ severity: 'advisory', component: 'perf', confidence: 0.7 }]);
  assert.equal(d.posture, 'GO');
  assert.equal(d.escalated, false);
  assert.equal(d.ownerType, 'system');
});

test('decidePosture: everything passed, no findings -> GO with full confidence', () => {
  const d = decidePosture(makeRun(), [{ status: 'pass' }, { status: 'pass' }], []);
  assert.equal(d.posture, 'GO');
  assert.equal(d.confidence, 0.95);
});

/* ---------- buildActionRequests ---------- */

test('buildActionRequests: only blocker/warning findings become action requests', () => {
  const run = makeRun();
  const findings = [
    { id: 'f1', severity: 'blocker', component: 'compare-flow', agentId: 'flow-compare', signals: ['sig1'], title: 't1', impact: 'i1', recommendedAction: 'r1', confidence: 0.9, riskScore: 88, executionContext: 'live' },
    { id: 'f2', severity: 'advisory', component: 'perf', agentId: 'perf-timing', signals: ['sig2'], title: 't2', impact: 'i2', recommendedAction: 'r2', confidence: 0.7, riskScore: 20, executionContext: 'live' },
  ];
  const signalsById = new Map([['sig1', { evidence: [{ label: 'shot', type: 'screenshot' }], dimension: 'functional' }]]);
  const ars = buildActionRequests(run, findings, signalsById);
  assert.equal(ars.length, 1);
  assert.equal(ars[0].findingId, 'f1');
  assert.equal(ars[0].state, 'open');
  assert.match(ars[0].verificationPlan, /Compare Flow Agent/);
});

/* ---------- applySupersession ---------- */

test('applySupersession: a newer passing run supersedes an open action request', () => {
  const oldRun = { id: 'run-1', status: 'completed', proof: null, environment: 'local', finishedAt: '2026-01-01T00:00:00Z', signals: [{ component: 'compare-flow', status: 'fail' }] };
  const newRun = { id: 'run-2', status: 'completed', proof: null, environment: 'local', finishedAt: '2026-01-02T00:00:00Z', signals: [{ component: 'compare-flow', status: 'pass' }] };
  const ar = { id: 'ar-1', runId: 'run-1', component: 'compare-flow', state: 'open', history: [] };
  applySupersession([oldRun, newRun], [ar]);
  assert.equal(ar.state, 'superseded');
  assert.equal(ar.supersededBy, 'run-2');
});

test('applySupersession: a rerun-queued action request becomes verified-fixed, not superseded', () => {
  const oldRun = { id: 'run-1', status: 'completed', proof: null, environment: 'local', finishedAt: '2026-01-01T00:00:00Z', signals: [{ component: 'compare-flow', status: 'fail' }] };
  const newRun = { id: 'run-2', status: 'completed', proof: null, environment: 'local', finishedAt: '2026-01-02T00:00:00Z', signals: [{ component: 'compare-flow', status: 'pass' }] };
  const ar = { id: 'ar-1', runId: 'run-1', component: 'compare-flow', state: 'rerun-queued', history: [] };
  applySupersession([oldRun, newRun], [ar]);
  assert.equal(ar.state, 'verified-fixed');
});

test('applySupersession: leaves terminal-state action requests untouched', () => {
  const oldRun = { id: 'run-1', status: 'completed', proof: null, environment: 'local', finishedAt: '2026-01-01T00:00:00Z', signals: [] };
  const newRun = { id: 'run-2', status: 'completed', proof: null, environment: 'local', finishedAt: '2026-01-02T00:00:00Z', signals: [{ component: 'compare-flow', status: 'pass' }] };
  const ar = { id: 'ar-1', runId: 'run-1', component: 'compare-flow', state: 'dismissed', history: [] };
  applySupersession([oldRun, newRun], [ar]);
  assert.equal(ar.state, 'dismissed');
});

test('a Build Smoke subset pass does not supersede a full-suite failure', () => {
  const failed = makeRun({ id: 'run-full', cadence: 'nightly-regression', finishedAt: '2026-01-01T00:00:00Z',
    signals: [{ component: 'external-suite', agentId: 'external-playwright-suite', status: 'fail' }] });
  const smoke = makeRun({ id: 'run-smoke', cadence: 'build-smoke', finishedAt: '2026-01-02T00:00:00Z',
    signals: [{ component: 'external-suite', agentId: 'external-playwright-suite', status: 'pass', extra: { subset: true } }] });
  const ar = { runId: 'run-full', component: 'external-suite', state: 'open', history: [] };
  applySupersession([smoke, failed], [ar]);
  assert.equal(ar.state, 'open');
  assert.equal(isSubsetPass(smoke, smoke.signals[0]), true);

  const full = makeRun({ id: 'run-full-2', cadence: 'nightly-regression', finishedAt: '2026-01-03T00:00:00Z',
    signals: [{ component: 'external-suite', agentId: 'external-playwright-suite', status: 'pass', extra: { subset: false } }] });
  applySupersession([full, smoke, failed], [ar]);
  assert.equal(ar.state, 'superseded');
  assert.equal(ar.supersededBy, 'run-full-2');
});

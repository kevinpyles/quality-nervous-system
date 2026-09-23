/* ============================================================
   Unit tests for the app-wide posture roll-up (issues.mjs):
   a failing component keeps the app NO-GO until a newer run of
   THAT component passes — a passing run of something else, or a
   narrower rerun, must never flip it to GO.
   Run with: npm test  (node --test server/)
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openIssueFor, openIssues, currentPosture } from './issues.mjs';

let seq = 0;
function run({ proof = null, results }) {
  const id = `run-${++seq}`;
  const signals = [], findings = [];
  for (const [component, status, severity = 'blocker'] of results) {
    const sid = `sig-${id}-${component}`;
    signals.push({ id: sid, component, status, agentId: `${component}-agent` });
    if (status !== 'pass') {
      findings.push({ id: `f-${id}-${component}`, component, severity, signals: [sid], title: `${component} failed`,
        agentId: `${component}-agent`, riskScore: severity === 'blocker' ? 88 : 62, confidence: 0.9 });
    }
  }
  return { id, status: 'completed', proof, proofName: proof ? 'Blocked Action' : null, signals, findings, finishedAt: new Date().toISOString() };
}
/* state.runs is newest-first, like the real store */
const stateOf = (...newestFirst) => ({ runs: newestFirst, actionRequests: [] });

test('a failing test makes the app NO-GO', () => {
  const s = stateOf(run({ results: [['external-suite', 'fail'], ['metrics', 'pass']] }));
  const p = currentPosture(s);
  assert.equal(p.posture, 'NO-GO');
  assert.match(p.reason, /external-suite/);
  assert.equal(p.issue.componentId, 'external-suite');
});

test('a later run that only covers OTHER components does not clear the failure', () => {
  const nightly = run({ results: [['external-suite', 'fail'], ['compare-flow', 'pass']] });
  const rerunOfSomethingElse = run({ results: [['compare-flow', 'pass']] });
  const p = currentPosture(stateOf(rerunOfSomethingElse, nightly));
  assert.equal(p.posture, 'NO-GO', 'the Test Suite is still failing');
  assert.equal(p.issue.runId, nightly.id, 'briefing points at the run that failed');
});

test('rerunning the failing component and passing returns the app to GO', () => {
  const nightly = run({ results: [['external-suite', 'fail'], ['metrics', 'pass']] });
  const rerun = run({ results: [['external-suite', 'pass']] });
  const p = currentPosture(stateOf(rerun, nightly));
  assert.equal(p.posture, 'GO');
  assert.deepEqual(p.counts, { pass: 2, fail: 0, degraded: 0, total: 2 });
});

test('a passing SUBSET run (Build Smoke slice) does not clear a full-suite failure', () => {
  const nightly = run({ results: [['external-suite', 'fail']] });
  const smoke = run({ results: [['external-suite', 'pass']] });
  smoke.signals[0].extra = { subset: true };
  assert.equal(currentPosture(stateOf(smoke, nightly)).posture, 'NO-GO');
  const full = run({ results: [['external-suite', 'pass']] });
  full.signals[0].extra = { subset: false };
  assert.equal(currentPosture(stateOf(full, smoke, nightly)).posture, 'GO', 'a full pass does clear it');
});

test('a warning alone is CONDITIONAL; a blocker anywhere wins', () => {
  const warnOnly = stateOf(run({ results: [['performance', 'degraded', 'warning']] }));
  assert.equal(currentPosture(warnOnly).posture, 'CONDITIONAL');
  const both = stateOf(run({ results: [['performance', 'degraded', 'warning'], ['security', 'fail', 'blocker']] }));
  const p = currentPosture(both);
  assert.equal(p.posture, 'NO-GO');
  assert.equal(p.issue.componentId, 'security', 'blockers are briefed before warnings');
});

test('a human accepting the risk clears the issue', () => {
  const r = run({ results: [['external-suite', 'fail']] });
  const s = stateOf(r);
  s.actionRequests = [{ findingId: r.findings[0].id, state: 'risk-accepted' }];
  assert.equal(openIssueFor(s, 'external-suite'), null);
  assert.equal(currentPosture(s).posture, 'GO');
});

test('proof-only issues are NO-GO but labeled as a controlled proof; a real failure is never hidden by the label', () => {
  const proofOnly = stateOf(run({ proof: 'proof-blocked-action', results: [['compare-flow', 'fail']] }));
  const p1 = currentPosture(proofOnly);
  assert.equal(p1.posture, 'NO-GO');
  assert.equal(p1.controlledProof, true);
  assert.match(p1.reason, /controlled proof/);

  const mixed = stateOf(
    run({ proof: 'proof-blocked-action', results: [['compare-flow', 'fail']] }),
    run({ results: [['external-suite', 'fail']] }),
  );
  const p2 = currentPosture(mixed);
  assert.equal(p2.controlledProof, false);
  assert.equal(openIssues(mixed).length, 2);
});

test('advisory findings never block', () => {
  const s = stateOf(run({ results: [['performance', 'degraded', 'advisory']] }));
  assert.equal(currentPosture(s).posture, 'GO');
});

test('no completed runs is UNKNOWN', () => {
  assert.equal(currentPosture({ runs: [{ status: 'running' }], actionRequests: [] }).posture, 'UNKNOWN');
});

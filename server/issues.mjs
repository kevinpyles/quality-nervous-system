/* ============================================================
   Open issues + current release posture.

   A component's MOST RECENT completed observation (live run or
   controlled proof) decides whether it has an open issue. The
   release posture is the roll-up of those issues across the whole
   app — not just whatever the last run happened to cover — so a
   one-agent rerun that passes can never flip the app to GO while
   another component is still failing. An issue clears only when a
   newer run of that component passes, or a human resolves its
   action request (accept risk / dismiss).

   Pure state-in/JSON-out (see issues.test.mjs).
   ============================================================ */

import { COMPONENTS } from './catalog.mjs';
import { isSubsetPass } from './brain.mjs';

const RESOLVED_AR_STATES = new Set(['risk-accepted', 'dismissed', 'verified-fixed', 'superseded']);

function latestObservation(state, componentId) {
  for (const run of state.runs || []) {
    if (run.status !== 'completed') continue;
    const signal = (run.signals || []).find((s) => s.component === componentId);
    // a pass that only covered a subset (e.g. Build Smoke's slice of the
    // external suite) can't vouch for the tests it skipped — look further back
    if (signal && isSubsetPass(run, signal)) continue;
    if (signal) return { run, signal };
  }
  return null;
}

export function openIssueFor(state, componentId) {
  const obs = latestObservation(state, componentId);
  if (!obs || obs.signal.status === 'pass') return null;
  const { run } = obs;
  const finding = (run.findings || []).find((f) => f.component === componentId);
  if (!finding || finding.severity === 'advisory') return null;
  const ar = (state.actionRequests || []).find((a) => a.findingId === finding.id);
  if (ar && RESOLVED_AR_STATES.has(ar.state)) return null;
  return {
    componentId,
    findingId: finding.id,
    runId: run.id,
    severity: finding.severity,          // blocker | warning
    title: finding.title,
    agentId: finding.agentId,
    riskScore: finding.riskScore ?? 0,
    confidence: finding.confidence ?? null,
    proof: run.proof || null,
    proofName: run.proofName || null,
    finishedAt: run.finishedAt,
  };
}

export function openIssues(state) {
  return COMPONENTS.map((c) => openIssueFor(state, c.id)).filter(Boolean);
}

/* The app-wide posture, in the same shape as a run's decision so the
   cockpit renders it unchanged. `run` / `briefing` point at the worst
   open issue (blockers first, then risk) — the thing to fix next. */
export function currentPosture(state) {
  const latest = (state.runs || []).find((r) => r.status === 'completed');
  if (!latest) return { posture: 'UNKNOWN', reason: 'No completed runs yet.', runId: null, issue: null, counts: null };

  const counts = { pass: 0, fail: 0, degraded: 0, total: 0 };
  for (const c of COMPONENTS) {
    const obs = latestObservation(state, c.id);
    if (!obs) continue;
    counts.total++;
    if (obs.signal.status === 'pass') counts.pass++;
    else if (obs.signal.status === 'fail') counts.fail++;
    else counts.degraded++;
  }

  const issues = openIssues(state);
  const blockers = issues.filter((i) => i.severity === 'blocker');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const name = (i) => i.componentId + (i.proof ? ' (controlled proof)' : '');

  let posture, reason;
  if (blockers.length) {
    posture = 'NO-GO';
    reason = `${blockers.length} open release-blocking issue(s): ${blockers.map(name).join(', ')}. `
      + 'Stays NO-GO until a rerun passes or the risk is accepted.';
  } else if (warnings.length) {
    posture = 'CONDITIONAL';
    reason = `${warnings.length} open warning(s) need human judgment before release: ${warnings.map(name).join(', ')}.`;
  } else {
    posture = 'GO';
    reason = 'No open blockers or warnings — every component\'s most recent check passed.';
  }

  const worst = [...blockers, ...warnings].sort((a, b) =>
    (a.severity === b.severity ? 0 : a.severity === 'blocker' ? -1 : 1) || b.riskScore - a.riskScore)[0] || null;
  const escalated = issues.length > 0;
  const confidences = issues.map((i) => i.confidence).filter((c) => c != null);

  return {
    posture,
    reason,
    ownerType: escalated ? 'human' : 'system',
    decidedBy: escalated ? 'pending-human' : 'qns-brain',
    escalated,
    confidence: confidences.length ? Math.min(...confidences) : 0.95,
    counts,
    // only a proof-driven posture is labeled as one — a real failure never hides behind the tag
    controlledProof: issues.length > 0 && issues.every((i) => i.proof),
    openIssues: issues.length,
    runId: worst ? worst.runId : latest.id,
    issue: worst,
  };
}

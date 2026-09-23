/* ============================================================
   QNS Brain — normalize → connect → cluster → compare with
   history → estimate → decide/escalate → act → track verification.
   (Requirements §QNS brain responsibilities, §Decision ownership)
   ============================================================ */

import { randomUUID } from 'node:crypto';
import { AGENTS, PROOFS, SEVERITIES, APP_UNDER_TEST } from './catalog.mjs';

const uid = (p) => `${p}-${randomUUID().slice(0, 8)}`;

/* How an agent produces its results — scripted assertion vs. AI-driven
   exploration. Single source of truth (also used by the app-graph
   aggregator to tag components with their automation type). */
export function executionModeFor(agentDef) {
  return agentDef.role === 'spider' || agentDef.role === 'scanner' ? 'ai-agent' : 'automated';
}

/* 3. Normalize an agent execution into the signal contract */
export function normalizeSignal(run, agentDef, result, evidence, meta = {}) {
  const severity =
    result.status === 'fail' ? agentDef.severityOnFail
    : result.status === 'degraded' ? 'advisory'
    : 'info';
  return {
    id: uid('sig'),
    runId: run.id,
    app: run.app,
    build: run.build,
    environment: run.environment,
    cadence: run.cadence,
    component: agentDef.component,
    dimension: agentDef.category,
    executionMode: executionModeFor(agentDef),
    executionContext: run.proof ? 'controlled-proof' : (run.scope?.type === 'rerun-failed' ? 'rerun' : 'live'),
    severity,
    status: result.status,
    finding: result.finding,
    evidence,
    impact: result.impact,
    recommendedAction: result.recommendedAction,
    ownerType: severity === 'blocker' || severity === 'warning' ? 'human' : 'system',
    confidence: result.confidence ?? 0.8,
    agentId: agentDef.id,
    agentName: agentDef.name,
    details: result.details || [],
    extra: result.extra || null,
    flaky: !!meta.flaky,
    controlsTouched: meta.controlsTouched || [],
    perfTrend: null, // filled in by the engine for perf-timing signals
    createdAt: new Date().toISOString(),
  };
}

/* Perf trend: compare a perf-timing signal's compareMs against a trailing
   baseline from prior LIVE runs of the same agent/component, independent of
   the agent's own fixed pass/fail threshold. Requires >=2 prior samples. */
const PERF_TREND_SAMPLES = 5;
const PERF_REGRESSION_PCT = 35;
const PERF_IMPROVEMENT_PCT = -25;

export function computePerfTrend(agentId, component, history, currentExtra) {
  if (!currentExtra?.compareMs) return null;
  const samples = history
    .filter((r) => r.status === 'completed' && !r.proof)
    .flatMap((r) => r.signals || [])
    .filter((s) => s.agentId === agentId && s.component === component && s.extra?.compareMs != null)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, PERF_TREND_SAMPLES)
    .map((s) => s.extra.compareMs);
  if (samples.length < 2) return null;
  const baselineMs = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const deltaPct = Math.round(((currentExtra.compareMs - baselineMs) / baselineMs) * 100);
  const trend = deltaPct >= PERF_REGRESSION_PCT ? 'regression'
    : deltaPct <= PERF_IMPROVEMENT_PCT ? 'improvement'
    : 'stable';
  return { baselineMs, currentMs: currentExtra.compareMs, deltaPct, trend, sampleCount: samples.length };
}

/* A visual diff below this is just evidence; at/above it, it earns its own
   advisory finding even though the underlying check passed. Exported so the
   app-graph aggregator can flag the same signals as "worth a click". */
export const VISUAL_DIFF_FINDING_PCT = 5;

/* 5–7. Cluster related findings, compare against history, estimate */
export function synthesize(run, signals, history) {
  const problems = signals.filter((s) => s.status === 'fail' || s.status === 'degraded');

  // cluster by component
  const clusters = new Map();
  for (const s of problems) {
    if (!clusters.has(s.component)) clusters.set(s.component, []);
    clusters.get(s.component).push(s);
  }

  const findings = [...clusters.entries()].map(([component, sigs]) => {
    const worst = sigs.slice().sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))[0];
    // 6. compare against history: is this new for this build, or inherited?
    const priorRuns = history.filter((r) => r.id !== run.id && r.status === 'completed' && !r.proof);
    const sameBuildPrior = priorRuns.filter((r) => r.build?.fingerprint === run.build?.fingerprint);
    const previouslyFailedHere = priorRuns.some((r) =>
      (r.signals || []).some((s) => s.component === component && s.status === 'fail'));
    const passedOnThisBuildBefore = sameBuildPrior.some((r) =>
      (r.signals || []).some((s) => s.component === component && s.status === 'pass'));
    const historyNote = run.proof
      ? 'Controlled proof scenario — defect was seeded deliberately.'
      : worst.flaky
        ? 'Failed on first attempt but passed on an immediate retry — likely flaky/intermittent rather than a deterministic regression. Investigate for timing or race conditions before treating this as a hard release blocker.'
        : previouslyFailedHere
          ? 'This component has failed in previous runs — likely inherited, not new in this build.'
          : passedOnThisBuildBefore
            ? 'This component passed earlier on this same build — possible flakiness or environment drift.'
            : 'First observed failure for this component in recorded history — likely new in this build.';

    const riskScore = Math.round(
      (worst.severity === 'blocker' ? 88 : worst.severity === 'warning' ? 62 : 30)
      * (0.7 + 0.3 * worst.confidence)
    );

    return {
      id: uid('finding'),
      runId: run.id,
      component,
      severity: worst.severity,
      status: worst.status,
      title: worst.finding,
      agentId: worst.agentId,
      agentName: worst.agentName,
      signals: sigs.map((s) => s.id),
      impact: worst.impact,
      recommendedAction: worst.recommendedAction,
      historyNote,
      riskScore,
      confidence: worst.confidence,
      executionContext: worst.executionContext,
      createdAt: new Date().toISOString(),
    };
  });

  // Passing signals can still be finding-worthy: perf regressions against a
  // trailing baseline, and visual diffs against the last passing screenshot —
  // both advisory-only (informational; never a blocker, never an action request).
  const seenComponents = new Set(findings.map((f) => f.component));
  for (const s of signals) {
    if (s.status !== 'pass' || seenComponents.has(s.component)) continue;

    if (s.perfTrend?.trend === 'regression') {
      findings.push({
        id: uid('finding'),
        runId: run.id,
        component: s.component,
        severity: 'advisory',
        status: 'pass',
        title: `Performance trending worse: ${s.agentName} is ${s.perfTrend.deltaPct}% slower than its trailing baseline (${s.perfTrend.currentMs}ms vs ~${s.perfTrend.baselineMs}ms).`,
        agentId: s.agentId,
        agentName: s.agentName,
        signals: [s.id],
        impact: 'Still within the pass threshold, but the trend suggests a creeping regression worth investigating before it crosses the hard limit.',
        recommendedAction: 'Profile recent changes to this component; compare against the trailing baseline.',
        historyNote: `Trend computed from the last ${s.perfTrend.sampleCount} live run(s) of this agent.`,
        riskScore: 22,
        confidence: 0.7,
        executionContext: s.executionContext,
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const diffEvidence = (s.evidence || []).find((e) => e.type === 'visual-diff' && e.diffPct >= VISUAL_DIFF_FINDING_PCT);
    if (diffEvidence) {
      findings.push({
        id: uid('finding'),
        runId: run.id,
        component: s.component,
        severity: 'advisory',
        status: 'pass',
        title: `Visual regression: ${s.agentName}'s screenshot differs ${diffEvidence.diffPct}% from the last passing baseline.`,
        agentId: s.agentId,
        agentName: s.agentName,
        signals: [s.id],
        impact: 'The check still passed its functional assertions, but the rendered UI changed unexpectedly.',
        recommendedAction: 'Review the visual diff evidence; confirm the change is intentional.',
        historyNote: `Compared against baseline run ${diffEvidence.baselineRunId}.`,
        riskScore: 20,
        confidence: 0.65,
        executionContext: s.executionContext,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return findings;
}

/* 8. Decide whether QNS can act autonomously or must escalate.
      9. Release posture. */
export function decidePosture(run, signals, findings) {
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const advisories = findings.filter((f) => f.severity === 'advisory');

  let posture, reason;
  if (signals.length === 0) {
    posture = 'UNKNOWN'; reason = 'No signals were produced by this run.';
  } else if (blockers.length) {
    posture = 'NO-GO';
    reason = `${blockers.length} release-blocking finding(s): ${blockers.map((f) => f.component).join(', ')}.`;
  } else if (warnings.length) {
    posture = 'CONDITIONAL';
    reason = `${warnings.length} warning-level finding(s) require human judgment before release: ${warnings.map((f) => f.component).join(', ')}.`;
  } else if (advisories.length) {
    posture = 'GO';
    reason = `All checks passed; ${advisories.length} advisory note(s) recorded.`;
  } else {
    posture = 'GO';
    reason = 'Every executed check passed cleanly.';
  }

  // Decision ownership: blockers/warnings escalate; advisories/info are system-owned.
  const ownerType = (blockers.length || warnings.length) ? 'human' : 'system';
  const decision = {
    posture,
    reason,
    ownerType,
    decidedBy: ownerType === 'system' ? 'qns-brain' : 'pending-human',
    escalated: ownerType === 'human',
    confidence: findings.length
      ? Math.min(...findings.map((f) => f.confidence))
      : 0.95,
    counts: {
      pass: signals.filter((s) => s.status === 'pass').length,
      fail: signals.filter((s) => s.status === 'fail').length,
      degraded: signals.filter((s) => s.status === 'degraded').length,
      total: signals.length,
    },
    controlledProof: !!run.proof,
    createdAt: new Date().toISOString(),
  };
  return decision;
}

/* 9. Action requests from findings that need attention */
export function buildActionRequests(run, findings, signalsById) {
  return findings
    .filter((f) => f.severity === 'blocker' || f.severity === 'warning')
    .map((f) => {
      const agent = AGENTS.find((a) => a.id === f.agentId);
      const src = f.signals.map((id) => signalsById.get(id)).filter(Boolean);
      return {
        id: uid('ar'),
        runId: run.id,
        findingId: f.id,
        title: `${f.severity === 'blocker' ? 'Blocker' : 'Warning'}: ${agent?.name || f.agentId} failed on ${f.component}`,
        severity: f.severity,
        app: run.app,
        component: f.component,
        dimensions: [...new Set(src.map((s) => s.dimension))],
        finding: f.title,
        evidenceSummary: src.flatMap((s) => (s.evidence || []).map((e) => e.label || e.type)).join(', ') || 'none captured',
        impact: f.impact,
        recommendedAction: f.recommendedAction,
        verificationPlan: `Rerun ${agent?.name || f.agentId} against the same build (${run.build?.label}) and environment (${run.environment}); the finding is verified fixed when the agent passes.`,
        sourceSignals: f.signals,
        confidence: f.confidence,
        riskScore: f.riskScore,
        ownerType: 'human',
        state: 'open',                 // open | bug-drafted | fix-requested | rerun-queued | risk-accepted | dismissed | verified-fixed | superseded
        executionContext: f.executionContext,
        availableActions: ['bug-draft', 'fix-request', 'rerun', 'accept-risk', 'dismiss'],
        history: [{ at: new Date().toISOString(), event: 'created by qns-brain' }],
        createdAt: new Date().toISOString(),
      };
    });
}

/* Bug-ticket draft from an action request */
export function draftBugTicket(ar, run) {
  const proof = PROOFS.find((p) => run.proof === p.id);
  return {
    id: uid('bug'),
    actionRequestId: ar.id,
    kind: 'bug-ticket-draft',
    title: `[${ar.severity.toUpperCase()}] ${ar.finding.slice(0, 110)}`,
    app: ar.app,
    component: ar.component,
    build: run.build,
    environment: run.environment,
    executionContext: ar.executionContext,
    controlledProofNote: proof ? `Seeded via controlled proof "${proof.name}" — this drafts the workflow, not a live product defect.` : null,
    expectedBehavior: ar.recommendedAction.includes('rerun')
      ? `The ${ar.component} check should pass: ${AGENTS.find((a) => a.id === ar.dimensions && a.component === ar.component)?.description || 'behavior per specification.'}`
      : `Behavior per the ${APP_UNDER_TEST.name} specification and test suite.`,
    actualBehavior: ar.finding,
    reproductionSteps: [
      `Serve ${APP_UNDER_TEST.name} locally (${run.build?.label})`,
      `Run the ${ar.title.split(': ')[1]?.split(' failed')[0] || 'failing agent'} (QNS cockpit → Agents → Run)`,
      'Observe the failing assertion in the run details and evidence.',
    ],
    evidenceLinks: ar.sourceSignals,
    impact: ar.impact,
    suggestedOwner: 'frontend',
    fixPrompt: `In ${APP_UNDER_TEST.name} (${ar.component}), fix: ${ar.finding} Impact: ${ar.impact} Constraint: do not change unrelated behavior; the fix is complete when the QNS "${ar.verificationPlan}"`,
    verificationPlan: ar.verificationPlan,
    createdAt: new Date().toISOString(),
  };
}

/* Governed agent fix request (draft-only executor in v1) */
export function draftFixRequest(ar, run) {
  return {
    id: uid('fix'),
    actionRequestId: ar.id,
    kind: 'agent-fix-request',
    assignee: 'Cody (governed)',
    state: 'draft-awaiting-dispatch',   // governance: human approved the draft; dispatch is stubbed in v1
    goal: `Investigate and fix: ${ar.finding}`,
    scope: {
      app: ar.app,
      component: ar.component,
      allowedPaths: [APP_UNDER_TEST.entry || 'index.html'],
      forbidden: 'No changes outside the app under test; no test deletions.',
    },
    contract: {
      inputs: `Finding ${ar.findingId}, evidence signals ${ar.sourceSignals.join(', ')}, build ${run.build?.label}`,
      completion: `Report completion ONLY when verification passes: ${ar.verificationPlan}`,
    },
    fixPrompt: `You are a governed fix agent for ${APP_UNDER_TEST.name}. ${ar.finding} Impact: ${ar.impact} Recommended direction: ${ar.recommendedAction} Verify by: ${ar.verificationPlan}`,
    verificationPlan: ar.verificationPlan,
    riskScore: ar.riskScore,
    createdAt: new Date().toISOString(),
  };
}

/* Supersede stale recommendations: a newer completed live run on the
   same app+environment+cadence supersedes older open recommendations. */
/* A pass that only covered a subset of a component's checks (Build Smoke's
   slice of the external suite) is real evidence but can't vouch for the
   tests it skipped, so it never clears a failure. Runs recorded before the
   agent flagged subsets: Build Smoke always ran a slice. */
export const isSubsetPass = (run, signal) => signal?.status === 'pass' && (signal.extra?.subset
  ?? (run.cadence === 'build-smoke' && signal.agentId === 'external-playwright-suite'));

export function applySupersession(runs, actionRequests) {
  const liveCompleted = runs
    .filter((r) => r.status === 'completed' && !r.proof)
    .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
  for (const ar of actionRequests) {
    if (['risk-accepted', 'dismissed', 'verified-fixed', 'superseded'].includes(ar.state)) continue;
    const arRun = runs.find((r) => r.id === ar.runId);
    if (!arRun) continue;
    const newer = liveCompleted.find((r) =>
      new Date(r.finishedAt) > new Date(arRun.finishedAt || arRun.startedAt) &&
      r.environment === arRun.environment &&
      (r.signals || []).some((s) => s.component === ar.component && !isSubsetPass(r, s)));
    if (newer) {
      const newerSignal = newer.signals.find((s) => s.component === ar.component);
      if (newerSignal?.status === 'pass') {
        ar.state = ar.state === 'rerun-queued' ? 'verified-fixed' : 'superseded';
        ar.supersededBy = newer.id;
        ar.history.push({ at: new Date().toISOString(), event: `superseded by ${newer.id}: component now ${newerSignal.status}` });
      }
    }
  }
}

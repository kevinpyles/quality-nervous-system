/* ============================================================
   App-graph aggregator — fuses the QNS data QNS already has
   (components, agents, findings/action-requests, perf trend,
   visual diffs) with the coverage instrumentation added in
   engine.mjs into one graph-shaped payload for the cockpit's
   "App-under-test graph" panel. Pure state-in/JSON-out, so it's
   unit-testable with synthetic fixtures (see app-graph.test.mjs).
   ============================================================ */

import { AGENTS, COMPONENTS, APP_UNDER_TEST } from './catalog.mjs';
import { executionModeFor, VISUAL_DIFF_FINDING_PCT } from './brain.mjs';
import { controlKey } from './control-identity.mjs';

function latestLiveSignalFor(runs, componentId) {
  let latest = null;
  for (const r of runs) {
    if (r.status !== 'completed' || r.proof) continue;
    for (const s of (r.signals || [])) {
      if (s.component !== componentId) continue;
      if (!latest || new Date(s.createdAt) > new Date(latest.createdAt)) latest = s;
    }
  }
  return latest;
}

function baseStatusFor(signal) {
  if (!signal) return 'never-run';
  if (signal.status === 'fail') return 'blocker-open';
  if (signal.status === 'degraded') return 'advisory-open';
  return 'pass';
}

export function buildAppGraph(state) {
  const runs = state.runs || [];
  const actionRequests = state.actionRequests || [];

  const components = COMPONENTS.map((c) => {
    const agentDef = AGENTS.find((a) => a.component === c.id);
    const lastSignal = latestLiveSignalFor(runs, c.id);

    const ars = actionRequests.filter((ar) => ar.component === c.id);
    const openActionRequests = ars.filter((ar) => ar.state === 'open').length;
    const totalActionRequests = ars.length;

    const perfTrend = (lastSignal?.agentId === 'perf-timing') ? (lastSignal.perfTrend || null) : null;
    const visualDiffEntry = (lastSignal?.evidence || []).find((e) => e.type === 'visual-diff' && e.diffPct >= VISUAL_DIFF_FINDING_PCT);
    const visualDiff = visualDiffEntry ? { diffPct: visualDiffEntry.diffPct, baselineRunId: visualDiffEntry.baselineRunId } : null;

    // A passing signal can still carry a live advisory condition (perf
    // regression / visual diff) — bump status so the ring reflects it even
    // though the underlying assertion passed. Mirrors synthesize()'s own
    // pass-but-advisory-finding logic in brain.mjs.
    let status = baseStatusFor(lastSignal);
    if (status === 'pass' && (perfTrend?.trend === 'regression' || visualDiff)) status = 'advisory-open';

    const hasSecondarySignal = openActionRequests > 0 || totalActionRequests > 0
      || perfTrend?.trend === 'regression' || visualDiff != null;

    return {
      id: c.id,
      label: c.label,
      status,
      agentId: agentDef?.id || null,
      agentName: agentDef?.name || null,
      executionMode: agentDef ? executionModeFor(agentDef) : null,
      lastSignal: lastSignal ? { at: lastSignal.createdAt, runId: lastSignal.runId, status: lastSignal.status, severity: lastSignal.severity } : null,
      openActionRequests,
      totalActionRequests,
      perfTrend,
      visualDiff,
      hasSecondarySignal,
    };
  });

  // Controls: the latest live Semantic Explorer signal's discovered inventory.
  let latestGraphSignal = null;
  for (const r of runs) {
    if (r.status !== 'completed' || r.proof) continue;
    for (const s of (r.signals || [])) {
      if (s.agentId !== 'semantic-explorer' || !s.extra?.runtimeGraph) continue;
      if (!latestGraphSignal || new Date(s.createdAt) > new Date(latestGraphSignal.createdAt)) latestGraphSignal = s;
    }
  }
  const discovered = latestGraphSignal?.extra?.runtimeGraph?.controls || [];

  // Control -> component edges, aggregated across ALL live completed runs'
  // controlsTouched. Proof runs excluded (deliberate defects, not live
  // verification — same !r.proof filtering used elsewhere in this codebase).
  // Legacy signals recorded before this feature shipped simply have no
  // controlsTouched field; treated as [] so the graph degrades to "no edges
  // yet" rather than throwing.
  const edgeByKey = new Map();
  for (const r of runs) {
    if (r.status !== 'completed' || r.proof) continue;
    for (const s of (r.signals || [])) {
      for (const c of (s.controlsTouched || [])) {
        const key = controlKey(c);
        if (!key) continue;
        let e = edgeByKey.get(key);
        if (!e) { e = { componentIds: new Set(), touchCount: 0, lastTouchedAt: null }; edgeByKey.set(key, e); }
        e.componentIds.add(s.component);
        e.touchCount += c.count || 1;
        if (!e.lastTouchedAt || new Date(s.createdAt) > new Date(e.lastTouchedAt)) e.lastTouchedAt = s.createdAt;
      }
    }
  }

  const controls = discovered.map((c) => {
    const e = edgeByKey.get(controlKey(c));
    return {
      key: controlKey(c),
      role: c.role, id: c.id, label: c.label, tag: c.tag, disabled: c.disabled,
      componentIds: e ? [...e.componentIds] : [],
      touchCount: e?.touchCount || 0,
      lastTouchedAt: e?.lastTouchedAt || null,
    };
  });

  return {
    app: APP_UNDER_TEST.name,
    components,
    controls,
    controlsCapturedAt: latestGraphSignal?.createdAt || null,
  };
}

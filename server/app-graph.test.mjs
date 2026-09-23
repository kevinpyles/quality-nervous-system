/* ============================================================
   Unit tests for the app-graph aggregator — pure state-in/JSON-out,
   synthetic fixtures, no server/browser needed.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAppGraph } from './app-graph.mjs';

function emptyState() { return { runs: [], actionRequests: [], artifacts: [], decisions: [] }; }

function componentOf(graph, id) { return graph.components.find((c) => c.id === id); }

test('buildAppGraph: a component with no recorded signal is "never-run"', () => {
  const graph = buildAppGraph(emptyState());
  assert.equal(componentOf(graph, 'compare-flow').status, 'never-run');
  assert.equal(componentOf(graph, 'compare-flow').lastSignal, null);
});

test('buildAppGraph: a passing live signal -> status "pass"', () => {
  const state = emptyState();
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [{ component: 'compare-flow', agentId: 'flow-compare', status: 'pass', severity: 'info', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', evidence: [] }],
  });
  const graph = buildAppGraph(state);
  assert.equal(componentOf(graph, 'compare-flow').status, 'pass');
  assert.equal(componentOf(graph, 'compare-flow').agentId, 'flow-compare');
  assert.equal(componentOf(graph, 'compare-flow').executionMode, 'automated');
});

test('buildAppGraph: a failing live signal -> status "blocker-open"', () => {
  const state = emptyState();
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [{ component: 'compare-flow', agentId: 'flow-compare', status: 'fail', severity: 'blocker', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', evidence: [] }],
  });
  assert.equal(componentOf(buildAppGraph(state), 'compare-flow').status, 'blocker-open');
});

test('buildAppGraph: a degraded live signal -> status "advisory-open"', () => {
  const state = emptyState();
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [{ component: 'dark-mode', agentId: 'dark-mode-agent', status: 'degraded', severity: 'advisory', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', evidence: [] }],
  });
  assert.equal(componentOf(buildAppGraph(state), 'dark-mode').status, 'advisory-open');
});

test('buildAppGraph: a passing signal with a perf-trend regression is bumped to advisory-open', () => {
  const state = emptyState();
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [{
      component: 'performance', agentId: 'perf-timing', status: 'pass', severity: 'info', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', evidence: [],
      perfTrend: { trend: 'regression', deltaPct: 60, currentMs: 2000, baselineMs: 1250, sampleCount: 3 },
    }],
  });
  const perf = componentOf(buildAppGraph(state), 'performance');
  assert.equal(perf.status, 'advisory-open');
  assert.equal(perf.hasSecondarySignal, true);
  assert.equal(perf.perfTrend.trend, 'regression');
});

test('buildAppGraph: a passing signal with a significant visual diff is bumped to advisory-open', () => {
  const state = emptyState();
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [{
      component: 'compare-flow', agentId: 'flow-compare', status: 'pass', severity: 'info', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1',
      evidence: [{ type: 'visual-diff', label: 'x', path: '/x', diffPct: 8, baselineRunId: 'run-0' }],
    }],
  });
  const cf = componentOf(buildAppGraph(state), 'compare-flow');
  assert.equal(cf.status, 'advisory-open');
  assert.deepEqual(cf.visualDiff, { diffPct: 8, baselineRunId: 'run-0' });
});

test('buildAppGraph: a visual diff below the finding threshold does not bump status', () => {
  const state = emptyState();
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [{
      component: 'compare-flow', agentId: 'flow-compare', status: 'pass', severity: 'info', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1',
      evidence: [{ type: 'visual-diff', label: 'x', path: '/x', diffPct: 2, baselineRunId: 'run-0' }],
    }],
  });
  const cf = componentOf(buildAppGraph(state), 'compare-flow');
  assert.equal(cf.status, 'pass');
  assert.equal(cf.visualDiff, null);
  assert.equal(cf.hasSecondarySignal, false);
});

test('buildAppGraph: open and total action-request counts are reported separately', () => {
  const state = emptyState();
  state.actionRequests.push(
    { id: 'ar-1', component: 'compare-flow', state: 'open' },
    { id: 'ar-2', component: 'compare-flow', state: 'verified-fixed' },
  );
  const cf = componentOf(buildAppGraph(state), 'compare-flow');
  assert.equal(cf.openActionRequests, 1);
  assert.equal(cf.totalActionRequests, 2);
  assert.equal(cf.hasSecondarySignal, true);
});

test('buildAppGraph: controls come from the latest live Semantic Explorer signal', () => {
  const state = emptyState();
  const runtimeGraph = { controls: [
    { role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button', disabled: false },
    { role: 'button', id: 'themeToggle', label: 'Toggle theme', tag: 'button', disabled: false },
  ] };
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [{ component: 'runtime-map', agentId: 'semantic-explorer', status: 'pass', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', extra: { runtimeGraph } }],
  });
  const graph = buildAppGraph(state);
  assert.equal(graph.controls.length, 2);
  assert.ok(graph.controls.every((c) => c.componentIds.length === 0)); // no touches recorded yet
});

test('buildAppGraph: a control touched by multiple components fans in; a never-touched control has zero edges', () => {
  const state = emptyState();
  const runtimeGraph = { controls: [
    { role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button', disabled: false },
    { role: 'button', id: 'themeToggle', label: 'Toggle theme', tag: 'button', disabled: false },
  ] };
  state.runs.push(
    {
      id: 'run-1', status: 'completed', proof: null,
      signals: [
        { component: 'runtime-map', agentId: 'semantic-explorer', status: 'pass', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', extra: { runtimeGraph } },
        { component: 'compare-flow', agentId: 'flow-compare', status: 'pass', createdAt: '2026-01-01T00:01:00Z', runId: 'run-1', controlsTouched: [{ role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button', count: 1 }] },
      ],
    },
    {
      id: 'run-2', status: 'completed', proof: null,
      signals: [
        { component: 'metrics', agentId: 'metric-calc', status: 'pass', createdAt: '2026-01-02T00:00:00Z', runId: 'run-2', controlsTouched: [{ role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button', count: 3 }] },
      ],
    },
  );
  const graph = buildAppGraph(state);
  const compareBtn = graph.controls.find((c) => c.id === 'compareBtn');
  assert.deepEqual(new Set(compareBtn.componentIds), new Set(['compare-flow', 'metrics']));
  assert.equal(compareBtn.touchCount, 4);
  const themeToggle = graph.controls.find((c) => c.id === 'themeToggle');
  assert.deepEqual(themeToggle.componentIds, []);
});

test('buildAppGraph: controlled-proof runs are excluded from coverage edges', () => {
  const state = emptyState();
  const runtimeGraph = { controls: [{ role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button', disabled: false }] };
  state.runs.push(
    {
      id: 'run-1', status: 'completed', proof: null,
      signals: [{ component: 'runtime-map', agentId: 'semantic-explorer', status: 'pass', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', extra: { runtimeGraph } }],
    },
    {
      id: 'run-2', status: 'completed', proof: 'proof-blocked-action',
      signals: [{ component: 'compare-flow', agentId: 'flow-compare', status: 'fail', createdAt: '2026-01-02T00:00:00Z', runId: 'run-2', controlsTouched: [{ role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button', count: 1 }] }],
    },
  );
  const compareBtn = buildAppGraph(state).controls.find((c) => c.id === 'compareBtn');
  assert.deepEqual(compareBtn.componentIds, []);
});

test('buildAppGraph: legacy signals with no controlsTouched field degrade to zero edges without throwing', () => {
  const state = emptyState();
  const runtimeGraph = { controls: [{ role: 'button', id: 'compareBtn', label: 'Compare', tag: 'button', disabled: false }] };
  state.runs.push({
    id: 'run-1', status: 'completed', proof: null,
    signals: [
      { component: 'runtime-map', agentId: 'semantic-explorer', status: 'pass', createdAt: '2026-01-01T00:00:00Z', runId: 'run-1', extra: { runtimeGraph } },
      { component: 'compare-flow', agentId: 'flow-compare', status: 'pass', createdAt: '2026-01-01T00:01:00Z', runId: 'run-1' }, // no controlsTouched
    ],
  });
  assert.doesNotThrow(() => buildAppGraph(state));
  assert.deepEqual(buildAppGraph(state).controls.find((c) => c.id === 'compareBtn').componentIds, []);
});

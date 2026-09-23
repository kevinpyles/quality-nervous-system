/* ============================================================
   Unit tests for the QNS engine's scope resolution — which
   agents a run scope resolves to. No Playwright/browser needed.
   Run with: npm test  (node --test server/)
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgents } from './engine.mjs';
import { state } from './store.mjs';
import { AGENTS } from './catalog.mjs';

test('resolveAgents: default (no scope) falls back to the build-smoke cadence', () => {
  const agents = resolveAgents(undefined);
  assert.ok(agents.length > 0);
  assert.ok(agents.every((a) => a.cadences.includes('build-smoke')));
});

test('resolveAgents: "all" returns the full catalog', () => {
  assert.equal(resolveAgents({ type: 'all' }).length, AGENTS.length);
});

test('resolveAgents: "cadence" filters by cadence membership', () => {
  const agents = resolveAgents({ type: 'cadence', value: 'nightly-regression' });
  assert.ok(agents.length > 0);
  assert.ok(agents.every((a) => a.cadences.includes('nightly-regression')));
});

test('resolveAgents: "dimension" filters by category', () => {
  const agents = resolveAgents({ type: 'dimension', value: 'accessibility' });
  assert.ok(agents.length > 0);
  assert.ok(agents.every((a) => a.category === 'accessibility'));
});

test('resolveAgents: "component" filters by the app component', () => {
  const agents = resolveAgents({ type: 'component', value: 'responsive' });
  assert.equal(agents.length, 1);
  assert.equal(agents[0].id, 'responsive-layout');
});

test('resolveAgents: "agent" returns exactly one agent by id', () => {
  const agents = resolveAgents({ type: 'agent', value: 'a11y-scan' });
  assert.equal(agents.length, 1);
  assert.equal(agents[0].id, 'a11y-scan');
});

test('resolveAgents: "rerun-failed" resolves to the agents that failed/degraded in the source run', () => {
  state.runs.push({
    id: 'test-run-rerun-fixture',
    signals: [
      { agentId: 'flow-compare', status: 'fail' },
      { agentId: 'metric-calc', status: 'pass' },
      { agentId: 'options-agent', status: 'degraded' },
    ],
  });
  try {
    const agents = resolveAgents({ type: 'rerun-failed', value: 'test-run-rerun-fixture' });
    const ids = agents.map((a) => a.id).sort();
    assert.deepEqual(ids, ['flow-compare', 'options-agent']);
  } finally {
    state.runs.pop();
  }
});

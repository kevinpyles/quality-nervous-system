/* ============================================================
   Unit tests for the store's retention/trim behavior — the fix for
   the always-on cockpit's unbounded memory growth (state.runs and
   friends were unshift-only, so every run's full signals/evidence
   stayed resident forever, and persist() re-serialized the whole
   growing history after every agent finished). No server/browser
   needed; trimState() only touches in-memory state plus real
   directories under EVIDENCE_DIR, so tests use clearly-fake
   "test-trim-…" run ids and always restore what they touched.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { state, RETENTION, trimState, EVIDENCE_DIR } from './store.mjs';

/* run each case against a clean slate and always restore whatever was
   in state before, regardless of pass/fail */
async function withCleanState(keys, fn) {
  const saved = Object.fromEntries(keys.map((k) => [k, state[k].slice()]));
  for (const k of keys) state[k].length = 0;
  try {
    await fn();
  } finally {
    for (const k of keys) { state[k].length = 0; state[k].push(...saved[k]); }
  }
}

test('trimState: leaves arrays under the retention limit untouched', async () => {
  await withCleanState(['runs', 'actionRequests', 'decisions', 'artifacts'], async () => {
    state.runs.push({ id: 'test-trim-a' }, { id: 'test-trim-b' });
    await trimState();
    assert.deepEqual(state.runs.map((r) => r.id), ['test-trim-a', 'test-trim-b']);
  });
});

test('trimState: caps state.runs at RETENTION.runs, keeping the newest (front) entries', async () => {
  await withCleanState(['runs'], async () => {
    for (let i = 0; i < RETENTION.runs + 10; i++) state.runs.push({ id: `test-trim-run-${i}` });
    await trimState();
    assert.equal(state.runs.length, RETENTION.runs);
    assert.equal(state.runs[0].id, 'test-trim-run-0');
    assert.equal(state.runs.at(-1).id, `test-trim-run-${RETENTION.runs - 1}`);
  });
});

test('trimState: caps actionRequests, decisions, and artifacts at their own limits', async () => {
  await withCleanState(['actionRequests', 'decisions', 'artifacts'], async () => {
    for (let i = 0; i < RETENTION.actionRequests + 5; i++) state.actionRequests.push({ id: `test-trim-ar-${i}` });
    for (let i = 0; i < RETENTION.decisions + 5; i++) state.decisions.push({ runId: `test-trim-dec-${i}` });
    for (let i = 0; i < RETENTION.artifacts + 5; i++) state.artifacts.push({ id: `test-trim-art-${i}` });
    await trimState();
    assert.equal(state.actionRequests.length, RETENTION.actionRequests);
    assert.equal(state.decisions.length, RETENTION.decisions);
    assert.equal(state.artifacts.length, RETENTION.artifacts);
  });
});

test('trimState: deletes the evidence directory for a run that ages out, leaves a retained one alone', async () => {
  const keepId = 'test-trim-evidence-keep';
  const dropId = 'test-trim-evidence-drop';
  await mkdir(path.join(EVIDENCE_DIR, keepId), { recursive: true });
  await mkdir(path.join(EVIDENCE_DIR, dropId), { recursive: true });
  try {
    await withCleanState(['runs'], async () => {
      state.runs.push({ id: keepId });
      for (let i = 0; i < RETENTION.runs; i++) state.runs.push({ id: `test-trim-evidence-filler-${i}` });
      state.runs.push({ id: dropId }); // past the cap once keepId + filler fill it
      await trimState();
      assert.ok(existsSync(path.join(EVIDENCE_DIR, keepId)), 'a run still within retention keeps its evidence dir');
      assert.ok(!existsSync(path.join(EVIDENCE_DIR, dropId)), 'a run aged out of retention has its evidence dir removed');
    });
  } finally {
    await rm(path.join(EVIDENCE_DIR, keepId), { recursive: true, force: true }).catch(() => {});
    await rm(path.join(EVIDENCE_DIR, dropId), { recursive: true, force: true }).catch(() => {});
  }
});

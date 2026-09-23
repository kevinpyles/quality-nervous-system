/* QNS evidence-memory store — JSON persistence for runs, action
   requests, artifacts, and decisions. Evidence files live under
   data/evidence/<runId>/. */

import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const EMPTY = { runs: [], actionRequests: [], artifacts: [], decisions: [] };

export const state = structuredClone(EMPTY);

/* These arrays are unshift-only — without a cap, an always-on cockpit
   keeps every run's full signals/evidence/findings in memory forever
   and re-serializes the whole growing history on every persist(). */
export const RETENTION = { runs: 200, actionRequests: 300, decisions: 300, artifacts: 200 };

export async function trimState() {
  const droppedRunIds = state.runs.length > RETENTION.runs
    ? state.runs.slice(RETENTION.runs).map((r) => r.id)
    : [];
  for (const key of Object.keys(RETENTION)) {
    if (state[key].length > RETENTION[key]) state[key].length = RETENTION[key];
  }
  await Promise.all(droppedRunIds.map((id) =>
    rm(path.join(EVIDENCE_DIR, id), { recursive: true, force: true }).catch(() => {})));
}

export async function initStore() {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  if (existsSync(STATE_FILE)) {
    try {
      Object.assign(state, JSON.parse(await readFile(STATE_FILE, 'utf8')));
    } catch (err) {
      console.error('[store] state.json unreadable, starting fresh:', err.message);
    }
  }
  // any run left "running" from a previous process is stale
  for (const r of state.runs) {
    if (r.status === 'running' || r.status === 'queued') r.status = 'stale';
  }
  await persist();
}

let writing = Promise.resolve();
export function persist() {
  writing = writing.then(async () => {
    await trimState();
    const tmp = STATE_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, STATE_FILE);
  }).catch((err) => console.error('[store] persist failed:', err.message));
  return writing;
}

export async function evidenceDirFor(runId) {
  const dir = path.join(EVIDENCE_DIR, runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

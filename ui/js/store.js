/* Tiny reactive store: state + pub/sub. Panels subscribe to keys. */

const state = {
  catalog: null,          // { app, agents, proofs, components, dimensions, cadences, mapNodes }
  health: null,
  target: null,           // { up, latencyMs, supervised }
  posture: null,          // /api/posture payload
  runs: [],               // summaries
  selectedRunId: null,
  selectedRun: null,      // full run detail
  selectedAgentId: null,
  selectedNodeId: null,
  actionRequests: [],
  artifacts: [],
  coverage: [],            // /api/coverage: per-component last-signal staleness
  graph: null,              // /api/graph: latest semantic-explorer runtime graph
  appGraph: null,          // /api/app-graph: components + controls + coverage/bug/automation fusion
  selectedComponentId: null,
  streamConnected: false,
  runFilter: { cadence: null, context: null },
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const subs = new Map(); // key -> Set<fn>

export function get(key) { return state[key]; }
export function getAll() { return state; }

export function set(patch) {
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    state[k] = v;
    changed.push(k);
  }
  const called = new Set();
  for (const k of changed) {
    for (const fn of subs.get(k) || []) {
      if (!called.has(fn)) { called.add(fn); try { fn(state); } catch (e) { console.error('[store sub]', e); } }
    }
  }
}

export function subscribe(keys, fn) {
  for (const k of [].concat(keys)) {
    if (!subs.has(k)) subs.set(k, new Set());
    subs.get(k).add(fn);
  }
  return fn;
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind ? 'toast--' + kind : ''}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}

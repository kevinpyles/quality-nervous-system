/* API client + SSE live stream. All data flows into the store;
   map pulses get raw events via onLiveEvent handlers. */

import { set, get, toast } from './store.js';

const J = (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
/* POST that surfaces the server's own error message (chat guards explain themselves) */
const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};

export const api = {
  health: () => fetch('/api/health').then(J),
  target: () => fetch('/api/target').then(J),
  targetPower: (on) => fetch(`/api/target/${on ? 'start' : 'stop'}`, { method: 'POST' }).then(J),
  catalog: () => fetch('/api/catalog').then(J),
  runs: () => fetch('/api/runs').then(J),
  run: (id) => fetch(`/api/runs/${id}`).then(J),
  posture: () => fetch('/api/posture').then(J),
  actionRequests: () => fetch('/api/action-requests').then(J),
  artifacts: () => fetch('/api/artifacts').then(J),
  coverage: () => fetch('/api/coverage').then(J),
  graph: () => fetch('/api/graph').then(J),
  appGraph: () => fetch('/api/app-graph').then(J),
  startRun: (body) => fetch('/api/runs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(J),
  act: (arId, type) => fetch(`/api/action-requests/${arId}/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }),
  }).then(J),
  chatSessions: () => fetch('/api/chat/sessions').then(J),
  chatSession: (id) => fetch(`/api/chat/sessions/${id}`).then(J),
  chatOpen: (body) => post('/api/chat/sessions', body),
  chatSend: (id, text) => post(`/api/chat/sessions/${id}/messages`, { text }),
  chatStop: (id) => post(`/api/chat/sessions/${id}/stop`, {}),
  chatApply: (id, messageId) => post(`/api/chat/sessions/${id}/apply`, { messageId }),
  chatUndo: (id) => post(`/api/chat/sessions/${id}/undo`, {}),
  chatRerun: (id) => post(`/api/chat/sessions/${id}/rerun`, {}),
  simulateDemo: (count) => fetch('/api/demo/simulate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count }),
  }).then(J),
};

export async function refreshCore() {
  const [health, target, posture, runs, actionRequests, artifacts, coverage, appGraph] = await Promise.all([
    api.health(), api.target(), api.posture(), api.runs(), api.actionRequests(), api.artifacts(),
    api.coverage(), api.appGraph(),
  ]);
  set({ health, target, posture, runs, actionRequests, artifacts, coverage, appGraph });
  const selId = get('selectedRunId');
  if (selId) {
    api.run(selId).then((r) => set({ selectedRun: r })).catch(() => {});
  } else if (runs.length) {
    selectRun(runs[0].id);
  }
}

export async function selectRun(id) {
  set({ selectedRunId: id });
  try { set({ selectedRun: await api.run(id) }); } catch { set({ selectedRun: null }); }
}

/* ---------- live stream ---------- */
const liveHandlers = new Set();
export function onLiveEvent(fn) { liveHandlers.add(fn); }

let refreshTimer = null;
function debouncedRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshCore().catch(() => {}), 250);
}

export function connectStream() {
  const es = new EventSource('/api/events');
  es.onopen = () => set({ streamConnected: true });
  es.onerror = () => { set({ streamConnected: false }); };
  es.onmessage = (m) => {
    let evt; try { evt = JSON.parse(m.data); } catch { return; }
    for (const fn of liveHandlers) { try { fn(evt); } catch (e) { console.error(e); } }
    switch (evt.type) {
      case 'run-queued':
        toast(`Run queued: ${evt.run?.cadence}${evt.run?.proofName ? ' · proof: ' + evt.run.proofName : ''}`);
        debouncedRefresh(); break;
      case 'run-started':
      case 'agent-finished':
      case 'action-request-updated':
      case 'artifact':
        debouncedRefresh(); break;
      case 'run-finished': {
        const p = evt.posture;
        toast(`Run ${evt.runId} finished → ${p || 'done'}`, p === 'NO-GO' ? 'alert' : p === 'GO' ? 'good' : '');
        // auto-focus the freshest run so the story stays current
        selectRun(evt.runId).then(debouncedRefresh);
        break;
      }
      case 'target-status':
        debouncedRefresh(); break;
      // demo-started / demo-finished / demo-pulse: visual-only pulse flood
      // for live demos (see engine.mjs#simulateDemoLoad). Deliberately NOT
      // wired to debouncedRefresh() — nothing real changed, so there is
      // nothing to re-fetch. Toasts here just keep the operator honest
      // about what's actually happening on screen.
      case 'demo-started':
        toast(`Demo: simulating ${evt.count} pulses (visual only — no real signal)`, '');
        break;
      case 'demo-finished':
        toast(`Demo: simulation finished (${evt.count} pulses)`, '');
        break;
    }
  };
  return es;
}

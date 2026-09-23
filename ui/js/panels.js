/* ============================================================
   QNS Cockpit panels — each panel renders the quality story
   from the store; none of them force the user to read raw
   telemetry. (Requirements §UI requirements)
   ============================================================ */

import { get, getAll, subscribe, toast } from './store.js';
import { api, selectRun, refreshCore } from './api.js';
import { registerPanel, getPanelBody } from './layout.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const ago = (iso) => {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const dur = (ms) => ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
const dot = (status) => `<span class="dot dot--${status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : status === 'degraded' ? 'degraded' : status === 'running' ? 'running' : 'idle'}"></span>`;
const sevChip = (sev) => `<span class="sev sev--${sev}">${sev}</span>`;
const evidenceLinks = (evidence) => evidence?.length
  ? `<span class="evidence-links">${evidence.map((e) => `<a href="${esc(e.path)}" target="_blank" rel="noopener">${esc(e.label || e.type)}</a>`).join('')}</span>`
  : '<span class="row-sub">no evidence captured</span>';

function definePanel(id, keys, render) {
  registerPanel(id, (body) => render(body, getAll()));
  subscribe(keys, () => {
    const body = getPanelBody(id);
    if (body) render(body, getAll());
  });
}

/* ============ Release posture ============ */
definePanel('release-posture', ['posture'], (body, s) => {
  const p = s.posture;
  if (!p) { body.innerHTML = '<span class="row-sub">waiting for the brain…</span>'; return; }
  const c = p.counts || {};
  body.innerHTML = `
    <div class="posture-big" data-posture="${esc(p.posture)}">${esc(p.posture)}</div>
    ${p.controlledProof ? '<div style="margin-bottom:6px;"><span class="sev sev--proof">controlled proof</span></div>' : ''}
    <p class="posture-reason">${esc(p.reason)}</p>
    <div class="posture-counts">${c.pass ?? 0} pass · ${c.fail ?? 0} fail · ${c.degraded ?? 0} degraded of ${c.total ?? 0}</div>
    <dl class="kv" style="margin-top:8px;">
      <dt>decision</dt><dd>${p.escalated ? 'escalated — pending human' : 'system-owned (qns-brain)'}</dd>
      <dt>confidence</dt><dd>${p.confidence != null ? Math.round(p.confidence * 100) + '%' : '—'}</dd>
      <dt>run</dt><dd>${p.run ? `${esc(p.run.id)} · ${esc(p.run.cadence)} · ${ago(p.run.finishedAt)}` : '—'}</dd>
      <dt>build</dt><dd>${esc(p.run?.build?.label || '—')} · ${esc(p.run?.environment || '')}</dd>
    </dl>`;
});

/* ============ Active failure — the guided investigation path ============ */
definePanel('active-failure', ['posture', 'actionRequests', 'artifacts'], (body, s) => {
  const p = s.posture;
  const b = p?.briefing;
  if (!b) {
    body.innerHTML = `<span class="row-sub">${p?.posture === 'GO' ? 'No active failure — every component\'s most recent check passed.' : 'No completed runs yet.'}</span>`;
    return;
  }
  const f = b.finding;
  const ar = s.actionRequests.find((x) => x.findingId === f.id) || b.actionRequest;
  const sigs = b.signals || [];
  const run = p.run;
  body.innerHTML = `
    <div class="briefing-step"><span class="briefing-step__n">01</span><div class="briefing-step__body">
      <strong>Posture is ${esc(p.posture)}</strong> — ${esc(p.reason)}</div></div>
    <div class="briefing-step"><span class="briefing-step__n">02</span><div class="briefing-step__body">
      <strong>${esc(f.agentName)}</strong> ran ${ago(run?.finishedAt)} in the <strong>${esc(run?.cadence)}</strong> cadence
      against <strong>${esc(run?.build?.label)}</strong> on <strong>${esc(run?.environment)}</strong>${f.executionContext === 'controlled-proof' ? ' <span class="sev sev--proof">controlled proof</span>' : ''}.</div></div>
    <div class="briefing-step"><span class="briefing-step__n">03</span><div class="briefing-step__body">
      <strong>What failed:</strong> ${esc(f.title)}<br><span class="row-sub">${esc(f.historyNote)}</span></div></div>
    <div class="briefing-step"><span class="briefing-step__n">04</span><div class="briefing-step__body">
      <strong>Evidence:</strong> ${evidenceLinks(sigs.flatMap((x) => x.evidence || []))}</div></div>
    <div class="briefing-step"><span class="briefing-step__n">05</span><div class="briefing-step__body">
      <strong>Risk ${f.riskScore}/100 · ${esc(f.severity)}</strong> — ${esc(f.impact)}<br>
      <strong>Do next:</strong> ${esc(f.recommendedAction)}<br>
      <span class="row-sub">Verify: ${esc(ar?.verificationPlan || 'rerun the failing agent')}</span></div></div>
    <div class="briefing-step"><span class="briefing-step__n">06</span><div class="briefing-step__body">
      ${ar && !['dismissed', 'risk-accepted', 'verified-fixed', 'superseded'].includes(ar.state) ? `
      <div class="mini-actions" data-ar="${esc(ar.id)}">
        <button class="qns-btn" data-act="bug-draft">Bug draft</button>
        <button class="qns-btn qns-btn--ai" data-act="fix-request">Fix request</button>
        <button class="qns-btn qns-btn--ghost" data-act="rerun">Rerun</button>
        <button class="qns-btn qns-btn--ghost" data-act="accept-risk">Accept risk</button>
        <button class="qns-btn qns-btn--ghost" data-act="dismiss">Dismiss</button>
      </div>
      `
      : `<span class="row-sub">action request state: ${esc(ar?.state || 'n/a')}${ar?.supersededBy ? ' · superseded by ' + esc(ar.supersededBy) : ''}</span>`}
      ${(() => {
        const art = ar && s.artifacts.find((a) => a.actionRequestId === ar.id);
        return art ? `<details style="margin-top:6px;"><summary style="cursor:pointer; font-family:var(--qns-font-mono); font-size:10px; color:var(--qns-accent-violet);">${esc(art.kind)} · ${esc(art.id)}</summary><pre class="artifact-pre">${esc(JSON.stringify(art, null, 2))}</pre></details>` : '';
      })()}
    </div></div>`;

  body.querySelectorAll('.mini-actions button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const arId = btn.closest('.mini-actions').dataset.ar;
      const act = btn.dataset.act;
      btn.disabled = true;
      try {
        const result = await api.act(arId, act);
        toast(`${act} → ${result.kind || result.state || result.status || 'ok'}`, 'good');
        refreshCore();
      } catch (err) { toast(`${act} failed: ${err.message}`, 'alert'); btn.disabled = false; }
    });
  });
});

/* ============ Run controls ============ */
definePanel('run-controls', ['catalog', 'target'], (body, s) => {
  const cat = s.catalog;
  if (!cat) { body.innerHTML = '<span class="row-sub">loading catalog…</span>'; return; }
  body.innerHTML = `
    <div class="ctl-group">
      <div class="ctl-group__label">cadence suites</div>
      <div class="ctl-row">
        <button class="qns-btn" data-run='{"scope":{"type":"cadence","value":"build-smoke"},"cadence":"build-smoke"}'>Build smoke</button>
        <button class="qns-btn" data-run='{"scope":{"type":"cadence","value":"nightly-regression"},"cadence":"nightly-regression"}'>Nightly</button>
        <button class="qns-btn qns-btn--ai" data-run='{"scope":{"type":"cadence","value":"release-gate"},"cadence":"release-gate","trigger":"release-gate"}'>Release gate</button>
      </div>
    </div>
    <div class="ctl-group">
      <div class="ctl-group__label">scoped run</div>
      <div class="ctl-row">
        <select id="ctl-dimension">
          <option value="">testing dimension…</option>
          ${cat.dimensions.map((d) => `<option value="${d}">${d}</option>`).join('')}
        </select>
        <select id="ctl-agent">
          <option value="">single agent…</option>
          ${cat.agents.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="ctl-row" style="margin-top:4px;">
        <button class="qns-btn qns-btn--ghost" id="ctl-run-scoped">Run scoped</button>
        <button class="qns-btn qns-btn--ghost" id="ctl-rerun-failed">Rerun failures of selected run</button>
      </div>
    </div>
    <div class="ctl-group">
      <div class="ctl-group__label">controlled proof scenarios · seeded defects</div>
      <div class="ctl-row">
        ${cat.proofs.map((p) => `<button class="qns-btn qns-btn--ghost" style="border-color: var(--qns-accent-magenta); color: var(--qns-accent-magenta);" data-run='{"proof":"${p.id}","cadence":"ad-hoc"}' title="${esc(p.description)}">${esc(p.name)}</button>`).join('')}
      </div>
    </div>
    <div class="ctl-group">
      <div class="ctl-group__label">target</div>
      <div class="ctl-row">
        <button class="qns-btn qns-btn--ghost" id="ctl-target-power">${s.target?.up ? 'Stop target (break availability)' : 'Start target'}</button>
      </div>
    </div>
    <div class="ctl-group" style="margin-bottom:0; border-top:1px dashed var(--qns-ink-faint,#556); padding-top:10px;">
      <div class="ctl-group__label" title="Visual only — creates no run, no signal, no evidence. Not a real cadence.">demo · map pulses (visual only, no real signal)</div>
      <div class="ctl-row">
        <input id="ctl-demo-count" type="number" min="1" max="5000" step="1" value="1000">
        <button class="qns-btn qns-btn--ghost" id="ctl-demo-simulate">Simulate pulses</button>
      </div>
    </div>`;

  body.querySelectorAll('[data-run]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await api.startRun({ trigger: 'manual-ui', ...JSON.parse(btn.dataset.run) }); }
      catch (err) { toast('run failed to start: ' + err.message, 'alert'); }
      setTimeout(() => { btn.disabled = false; }, 800);
    });
  });
  body.querySelector('#ctl-run-scoped').addEventListener('click', async () => {
    const dim = body.querySelector('#ctl-dimension').value;
    const agent = body.querySelector('#ctl-agent').value;
    if (agent) await api.startRun({ scope: { type: 'agent', value: agent }, cadence: 'ad-hoc', trigger: 'manual-ui' });
    else if (dim) await api.startRun({ scope: { type: 'dimension', value: dim }, cadence: 'ad-hoc', trigger: 'manual-ui' });
    else toast('pick a dimension or an agent first');
  });
  body.querySelector('#ctl-rerun-failed').addEventListener('click', async () => {
    const runId = get('selectedRunId');
    if (!runId) return toast('select a run first');
    try { await api.startRun({ scope: { type: 'rerun-failed', value: runId }, cadence: 'ad-hoc', trigger: 'manual-ui' }); }
    catch (err) { toast('nothing failed in that run, or: ' + err.message); }
  });
  body.querySelector('#ctl-target-power').addEventListener('click', async () => {
    await api.targetPower(!s.target?.up);
    refreshCore();
  });
  body.querySelector('#ctl-demo-simulate').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const count = parseInt(body.querySelector('#ctl-demo-count').value, 10) || 1000;
    btn.disabled = true;
    try {
      const r = await api.simulateDemo(count);
      if (!r.started) toast(r.reason || 'demo already running', 'alert');
    } catch (err) { toast('demo simulation failed: ' + err.message, 'alert'); }
    setTimeout(() => { btn.disabled = false; }, 800);
  });
});

/* ============ Selected node (3D map selection) ============ */
definePanel('selected-node', ['selectedNodeId', 'target', 'posture', 'catalog', 'artifacts', 'actionRequests', 'selectedRun'], (body, s) => {
  const id = s.selectedNodeId;
  const node = s.catalog?.mapNodes?.find((n) => n.id === id);
  if (!node) { body.innerHTML = '<span class="row-sub">Click a node on the map (or use arrow keys + Enter) to inspect it.</span>'; return; }
  const rows = { kind: node.kind };
  let extra = '';
  switch (id) {
    case 'app':
      Object.assign(rows, { target: s.target?.up ? `up · ${s.target.latencyMs}ms` : 'DOWN', url: s.target?.url });
      extra = `<a href="${esc(s.target?.url || '#')}" target="_blank" rel="noopener">open the app under test ↗</a>`;
      break;
    case 'environment':
      Object.assign(rows, { environment: 'local', served: s.target?.supervised ? 'QNS-supervised process' : 'external' });
      break;
    case 'agents': {
      const execs = s.selectedRun?.agentExecutions || [];
      Object.assign(rows, { roster: `${s.catalog.agents.length} agents`, 'in selected run': execs.length ? `${execs.filter((e) => e.status === 'pass').length}/${execs.length} pass` : 'none' });
      break;
    }
    case 'orchestrator':
      Object.assign(rows, { role: 'collect → normalize → cluster → decide', 'latest posture': s.posture?.posture || '—' });
      break;
    case 'memory': {
      const evCount = (s.selectedRun?.signals || []).reduce((n, x) => n + (x.evidence?.length || 0), 0);
      Object.assign(rows, { 'runs recorded': s.health?.runsRecorded ?? '—', 'evidence in selected run': evCount });
      break;
    }
    case 'human': {
      const pending = s.actionRequests.filter((a) => a.state === 'open').length;
      Object.assign(rows, { 'pending human decisions': pending, 'escalation rule': 'blockers + warnings escalate' });
      break;
    }
    case 'gate':
      Object.assign(rows, { posture: s.posture?.posture || '—', reason: s.posture?.reason || '—' });
      break;
    case 'bugfix': {
      const bugs = s.artifacts.filter((a) => a.kind === 'bug-ticket-draft').length;
      const fixes = s.artifacts.filter((a) => a.kind === 'agent-fix-request').length;
      Object.assign(rows, { 'bug drafts': bugs, 'fix requests': fixes });
      break;
    }
  }
  body.innerHTML = `
    <div style="font-family:var(--qns-font-display); font-weight:var(--qns-weight-bold); margin-bottom:6px;">${esc(node.label)}</div>
    <dl class="kv">${Object.entries(rows).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${extra ? `<div style="margin-top:8px; font-size:var(--qns-size-xs);">${extra}</div>` : ''}`;
});

/* ============ Agents roster ============ */
definePanel('agents', ['catalog', 'selectedRun', 'selectedAgentId'], (body, s) => {
  const cat = s.catalog;
  if (!cat) { body.innerHTML = ''; return; }
  const execs = new Map((s.selectedRun?.agentExecutions || []).map((e) => [e.agentId, e]));
  body.innerHTML = `<ul class="row-list">
    ${cat.agents.map((a) => {
      const ex = execs.get(a.id);
      return `<li data-agent="${a.id}" class="${s.selectedAgentId === a.id ? 'is-selected' : ''}">
        ${dot(ex?.status || 'idle')}
        <span class="row-main">${esc(a.name)}<br><span class="row-sub">${esc(a.category)} · ${esc(a.role)}</span></span>
        <span class="row-sub">${ex ? `risk ${ex.riskScore ?? '—'}` : 'not in run'}</span>
      </li>`;
    }).join('')}
  </ul>`;
  body.querySelectorAll('[data-agent]').forEach((li) => {
    li.addEventListener('click', () => {
      import('./store.js').then(({ set }) => set({ selectedAgentId: li.dataset.agent }));
    });
  });
});

/* ============ Selected agent ============ */
definePanel('selected-agent', ['selectedAgentId', 'selectedRun', 'catalog'], (body, s) => {
  const a = s.catalog?.agents?.find((x) => x.id === s.selectedAgentId);
  if (!a) { body.innerHTML = '<span class="row-sub">Select an agent from the roster.</span>'; return; }
  const ex = (s.selectedRun?.agentExecutions || []).find((e) => e.agentId === a.id);
  const sig = (s.selectedRun?.signals || []).find((x) => x.agentId === a.id);
  body.innerHTML = `
    <div style="font-family:var(--qns-font-display); font-weight:var(--qns-weight-bold); margin-bottom:4px;">${esc(a.name)}</div>
    <p style="font-size:var(--qns-size-xs); margin-bottom:8px;">${esc(a.description)}</p>
    <dl class="kv">
      <dt>category</dt><dd>${esc(a.category)}</dd>
      <dt>role</dt><dd>${esc(a.role)}</dd>
      <dt>executable</dt><dd>${esc(a.executable)}</dd>
      <dt>spec</dt><dd title="${esc(a.specPath)}">${esc(a.specPath)}</dd>
      <dt>inputs</dt><dd title="${esc(a.inputs)}">${esc(a.inputs)}</dd>
      <dt>outputs</dt><dd title="${esc(a.outputs)}">${esc(a.outputs)}</dd>
      <dt>cadences</dt><dd>${esc(a.cadences.join(', '))}</dd>
      <dt>on fail</dt><dd>${esc(a.severityOnFail)}</dd>
    </dl>
    ${ex ? `
      <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--qns-line);">
        <div style="margin-bottom:4px;">${dot(ex.status)}<b style="font-size:var(--qns-size-xs);">selected-run execution</b>
          <span class="row-sub">${dur(ex.durationMs)} · risk ${ex.riskScore ?? '—'}</span></div>
        ${sig ? `<p style="font-size:var(--qns-size-xs); margin:4px 0;">${esc(sig.finding)}</p>${evidenceLinks(sig.evidence)}` : ''}
      </div>` : '<div class="row-sub" style="margin-top:8px;">not part of the selected run</div>'}
    <div class="mini-actions" style="margin-top:10px;">
      <button class="qns-btn qns-btn--ghost" id="agent-run-one">Run this agent now</button>
    </div>`;
  body.querySelector('#agent-run-one').addEventListener('click', () => {
    api.startRun({ scope: { type: 'agent', value: a.id }, cadence: 'ad-hoc', trigger: 'manual-ui' });
  });
});

/* ============ Coverage / staleness ============ */
definePanel('coverage-staleness', ['coverage'], (body, s) => {
  const rows = s.coverage || [];
  if (!rows.length) { body.innerHTML = '<span class="row-sub">loading coverage…</span>'; return; }
  const bucketDot = { fresh: 'pass', aging: 'degraded', stale: 'stale', never: 'idle' };
  // A fail/degraded result is more urgent than staleness — status wins over freshness coloring.
  const dotClass = (c) => c.status === 'fail' ? 'fail' : c.status === 'degraded' ? 'degraded' : (bucketDot[c.bucket] || 'idle');
  body.innerHTML = `<ul class="row-list">
    ${rows.map((c) => `
      <li data-agent="${esc(c.agentId || '')}">
        <span class="dot dot--${dotClass(c)}"></span>
        <span class="row-main">${esc(c.label)}<br><span class="row-sub">${c.agentName ? `${esc(c.agentName)} · ${esc(c.status)}` : 'never run'}</span></span>
        <span class="row-sub">${c.at ? ago(c.at) : '—'}</span>
      </li>`).join('')}
  </ul>`;
  body.querySelectorAll('[data-agent]').forEach((li) => {
    if (!li.dataset.agent) return;
    li.addEventListener('click', () => {
      import('./store.js').then(({ set }) => set({ selectedAgentId: li.dataset.agent }));
    });
  });
});

/* ============ App-under-test graph — two-tier: a component coverage
   ring (bugs, automation type, perf/visual-diff hotspots) that drills
   down into the real controls each component exercises. ============ */
const AUT_ROLE_COLOR = {
  button: 'var(--qns-signal-discovery)',
  textbox: 'var(--qns-signal-memory)',
  checkbox: 'var(--qns-signal-decision)',
  tablist: 'var(--qns-accent-violet)',
  link: 'var(--qns-accent-magenta)',
};
const autRoleColor = (role) => AUT_ROLE_COLOR[role] || 'var(--qns-accent-cyan)';

const COMPONENT_STATUS_COLOR = {
  'pass': 'var(--qns-signal-memory)',
  'advisory-open': 'var(--qns-signal-decision)',
  'blocker-open': 'var(--qns-signal-alert-hot)',
  'never-run': 'var(--qns-ink-faint)',
};
const componentStatusColor = (status) => COMPONENT_STATUS_COLOR[status] || COMPONENT_STATUS_COLOR['never-run'];

/* The component coverage ring now lives on the living map itself
   (ui/js/map2d.js draws it as a satellite cluster around the app node)
   — this panel is the click-through: the selected component's actual
   linked controls, drawn as a hub-and-spoke... */
function renderControlSpokesSvg(component, allControls) {
  const linked = allControls.filter((c) => c.componentIds.includes(component.id));
  const W = 260, H = 200, CX = W / 2, CY = H / 2 + 4, R = 78;
  const n = Math.max(linked.length, 1);
  const nodes = linked.map((c, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { ...c, x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
  });
  const edges = nodes.map((nd) =>
    `<line x1="${CX}" y1="${CY}" x2="${nd.x.toFixed(1)}" y2="${nd.y.toFixed(1)}" stroke="var(--qns-line-lume)" stroke-width="1" />`
  ).join('');
  const nodeEls = nodes.map((nd) => {
    const label = esc((nd.id || nd.label || nd.tag || '?').slice(0, 14));
    const color = autRoleColor(nd.role);
    const title = `${esc(nd.role)} · ${esc(nd.id || nd.label || nd.tag || '?')} · touched ${nd.touchCount}×`;
    return `
      <g class="aut-graph__node">
        <circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="6" fill="${color}" stroke="${color}"><title>${title}</title></circle>
        <text x="${nd.x.toFixed(1)}" y="${(nd.y + (nd.y > CY ? 15 : -9)).toFixed(1)}" text-anchor="middle" class="aut-graph__label">${label}</text>
      </g>`;
  }).join('');
  return `
    <svg viewBox="0 0 ${W} ${H}" class="aut-graph__svg" role="img" aria-label="Controls exercised by ${esc(component.label)}: ${linked.length} controls">
      ${edges}${nodeEls}
      <circle cx="${CX}" cy="${CY}" r="12" fill="${componentStatusColor(component.status)}"><title>${esc(component.label)}</title></circle>
      <text x="${CX}" y="${CY + 24}" text-anchor="middle" class="aut-graph__label aut-graph__label--core">${esc(component.label)}</text>
    </svg>`;
}

definePanel('aut-graph', ['appGraph', 'selectedComponentId'], (body, s) => {
  const g = s.appGraph;
  if (!g) { body.innerHTML = '<span class="row-sub">loading app graph…</span>'; return; }
  const selected = g.components.find((c) => c.id === s.selectedComponentId) || null;
  const uncovered = g.controls.filter((c) => c.componentIds.length === 0);
  body.innerHTML = `
    <div class="row-sub" style="margin-bottom:6px;">${g.components.length} components (see the app node on the living map) · ${g.controls.length} discovered controls${g.controlsCapturedAt ? ' · captured ' + ago(g.controlsCapturedAt) : ''}</div>
    ${selected
      ? `<div class="aut-graph__tier2-wrap">${renderControlSpokesSvg(selected, g.controls)}</div>`
      : '<div class="row-sub" style="margin:6px 0;">Click a component on the living map to see the controls it exercises.</div>'}
    <div class="aut-graph__uncovered">
      <div class="ctl-group__label" style="margin-top:8px;">uncovered controls (${uncovered.length})</div>
      <ul class="row-list">
        ${uncovered.map((c) => `
          <li>
            <span class="sev sev--${c.disabled ? 'warning' : 'info'}">${esc(c.role)}</span>
            <span class="row-main">${esc(c.id || c.label || c.tag)}<br><span class="row-sub">${esc(c.tag)}${c.disabled ? ' · disabled' : ''}</span></span>
          </li>`).join('') || '<li><span class="row-sub">every discovered control is exercised by at least one agent</span></li>'}
      </ul>
    </div>`;
});

/* ============ Component detail — the click-through for the living
   map's component satellites: agent, automation type, the *specific*
   open bugs (grouped under one badge on the map, itemized here with
   real actions), perf/visual-diff, and the controls that component
   actually touches. ============ */
definePanel('component-detail', ['selectedComponentId', 'appGraph', 'actionRequests'], (body, s) => {
  const g = s.appGraph;
  const c = g?.components.find((x) => x.id === s.selectedComponentId);
  if (!c) { body.innerHTML = '<span class="row-sub">Click a component on the living map to inspect it.</span>'; return; }
  const linked = (g.controls || []).filter((ctrl) => ctrl.componentIds.includes(c.id));
  const openARs = s.actionRequests.filter((ar) => ar.component === c.id && ar.state === 'open');
  body.innerHTML = `
    <div style="font-family:var(--qns-font-display); font-weight:var(--qns-weight-bold); margin-bottom:4px;">${esc(c.label)}</div>
    <dl class="kv">
      <dt>status</dt><dd>${esc(c.status)}</dd>
      <dt>agent</dt><dd>${esc(c.agentName || '—')}</dd>
      <dt>automation</dt><dd>${esc(c.executionMode || '—')}</dd>
      <dt>last run</dt><dd>${c.lastSignal ? `${esc(c.lastSignal.status)} · ${ago(c.lastSignal.at)}` : 'never'}</dd>
      <dt>bugs</dt><dd>${c.openActionRequests} open · ${c.totalActionRequests} all-time</dd>
      ${c.perfTrend ? `<dt>perf trend</dt><dd>${esc(c.perfTrend.trend)} · ${c.perfTrend.deltaPct}% vs ~${c.perfTrend.baselineMs}ms baseline</dd>` : ''}
      ${c.visualDiff ? `<dt>visual diff</dt><dd>${c.visualDiff.diffPct}% vs baseline ${esc(c.visualDiff.baselineRunId)}</dd>` : ''}
    </dl>
    ${openARs.length ? `
    <div class="ctl-group__label" style="margin-top:10px;">open action${openARs.length === 1 ? '' : 's'} (${openARs.length})</div>
    ${openARs.map((ar) => `
      <div class="component-ar" data-ar="${esc(ar.id)}" style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid var(--qns-line);">
        <div style="margin-bottom:3px;">${sevChip(ar.severity)} <span class="row-sub">${esc(ar.title)}</span></div>
        <div class="mini-actions">
          <button class="qns-btn" data-act="bug-draft">Bug draft</button>
          <button class="qns-btn qns-btn--ai" data-act="fix-request">Fix request</button>
          <button class="qns-btn qns-btn--ghost" data-act="rerun">Rerun</button>
          <button class="qns-btn qns-btn--ghost" data-act="accept-risk">Accept risk</button>
          <button class="qns-btn qns-btn--ghost" data-act="dismiss">Dismiss</button>
        </div>
      </div>`).join('')}
    ` : ''}
    <div class="ctl-group__label" style="margin-top:10px;">controls exercised (${linked.length})</div>
    <ul class="row-list">
      ${linked.map((ctrl) => `<li><span class="row-main">${esc(ctrl.id || ctrl.label || ctrl.tag)}</span><span class="row-sub">${ctrl.touchCount}×</span></li>`).join('')
        || '<li><span class="row-sub">no linked controls recorded yet — run the agent to capture coverage</span></li>'}
    </ul>
    ${c.agentId ? '<div class="mini-actions" style="margin-top:10px;"><button class="qns-btn qns-btn--ghost" id="component-run-agent">Run this agent now</button></div>' : ''}`;
  if (c.agentId) {
    body.querySelector('#component-run-agent').addEventListener('click', () => {
      api.startRun({ scope: { type: 'agent', value: c.agentId }, cadence: 'ad-hoc', trigger: 'manual-ui' });
    });
  }
  body.querySelectorAll('.component-ar .mini-actions button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const arId = btn.closest('.component-ar').dataset.ar;
      const act = btn.dataset.act;
      btn.disabled = true;
      try {
        const result = await api.act(arId, act);
        toast(`${act} → ${result.kind || result.state || result.status || 'ok'}`, 'good');
        refreshCore();
      } catch (err) { toast(`${act} failed: ${err.message}`, 'alert'); btn.disabled = false; }
    });
  });
});

/* ============ Test run history ============ */
definePanel('run-history', ['runs', 'selectedRunId', 'runFilter'], (body, s) => {
  const f = s.runFilter;
  let runs = s.runs;
  if (f.context === 'live') runs = runs.filter((r) => !r.proof);
  if (f.context === 'proof') runs = runs.filter((r) => r.proof);
  if (f.cadence) runs = runs.filter((r) => r.cadence === f.cadence);
  body.innerHTML = `
    <div class="chip-filter" id="rh-filters">
      ${['all', 'live', 'proof'].map((c) => `<button data-ctx="${c}" class="${(f.context || 'all') === c ? 'is-active' : ''}">${c}</button>`).join('')}
      ${['build-smoke', 'nightly-regression', 'release-gate', 'ad-hoc'].map((c) => `<button data-cad="${c}" class="${f.cadence === c ? 'is-active' : ''}">${c.replace('-regression', '')}</button>`).join('')}
    </div>
    <ul class="row-list">
      ${runs.slice(0, 22).map((r) => `
        <li data-run="${r.id}" class="${s.selectedRunId === r.id ? 'is-selected' : ''}">
          ${dot(r.status === 'running' || r.status === 'queued' ? 'running' : r.counts?.fail ? 'fail' : r.counts?.degraded ? 'degraded' : r.status === 'completed' ? 'pass' : 'idle')}
          <span class="row-main">${esc(r.cadence)}${r.proofName ? ` <span class="sev sev--proof">${esc(r.proofName)}</span>` : ''}<br>
            <span class="row-sub">${esc(r.trigger)} · ${esc(r.build?.label || '')} · ${esc(r.environment)} · ${ago(r.createdAt)}</span></span>
          <span class="row-sub">${r.status === 'completed' ? `${r.counts.pass}✓ ${r.counts.fail}✗ · ${dur(r.durationMs)}` : r.status}</span>
        </li>`).join('') || '<li><span class="row-sub">no runs match this filter</span></li>'}
    </ul>`;
  body.querySelectorAll('#rh-filters [data-ctx]').forEach((b) => b.addEventListener('click', () => {
    import('./store.js').then(({ set }) => set({ runFilter: { ...f, context: b.dataset.ctx === 'all' ? null : b.dataset.ctx } }));
  }));
  body.querySelectorAll('#rh-filters [data-cad]').forEach((b) => b.addEventListener('click', () => {
    import('./store.js').then(({ set }) => set({ runFilter: { ...f, cadence: f.cadence === b.dataset.cad ? null : b.dataset.cad } }));
  }));
  body.querySelectorAll('[data-run]').forEach((li) => li.addEventListener('click', () => selectRun(li.dataset.run)));
});

/* ============ Run details ============ */
definePanel('run-details', ['selectedRun', 'selectedAgentId'], (body, s) => {
  const r = s.selectedRun;
  if (!r) { body.innerHTML = '<span class="row-sub">Select a run from the history.</span>'; return; }
  body.innerHTML = `
    <dl class="kv">
      <dt>run</dt><dd>${esc(r.id)}</dd>
      <dt>status</dt><dd>${esc(r.status)}${r.decision ? ` → ${esc(r.decision.posture)}` : ''}</dd>
      <dt>context</dt><dd>${r.proof ? `controlled proof · ${esc(r.proofName)}` : 'live verification'}</dd>
      <dt>scope</dt><dd>${esc(r.scope?.type)}${r.scope?.value ? ': ' + esc(r.scope.value) : ''}</dd>
      <dt>cadence</dt><dd>${esc(r.cadence)}</dd>
      <dt>trigger</dt><dd>${esc(r.trigger)}</dd>
      <dt>build</dt><dd>${esc(r.build?.label)} (${esc(r.build?.fingerprint)})</dd>
      <dt>environment</dt><dd>${esc(r.environment)}</dd>
      <dt>started</dt><dd>${r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : '—'}</dd>
      <dt>duration</dt><dd>${dur(r.durationMs)}</dd>
    </dl>
    ${r.error ? `<p style="color:var(--qns-signal-alert-hot); font-size:var(--qns-size-xs); margin-top:6px;">${esc(r.error)}</p>` : ''}
    <div class="ctl-group__label" style="margin-top:10px;">signals</div>
    ${(r.signals || []).map((sig) => `
      <details class="signal-detail">
        <summary>${dot(sig.status)}<span class="row-main">${esc(sig.agentName)}</span>${sevChip(sig.severity)}${sig.flaky ? '<span class="sev sev--advisory">flaky</span>' : ''}</summary>
        <div class="signal-detail__body">
          <p>${esc(sig.finding)}</p>
          <p><b>impact:</b> ${esc(sig.impact)}</p>
          <p><b>next:</b> ${esc(sig.recommendedAction)} <span class="row-sub">(confidence ${Math.round(sig.confidence * 100)}%)</span></p>
          ${sig.perfTrend ? `<p><b>trend:</b> ${esc(sig.perfTrend.trend)} · ${sig.perfTrend.deltaPct}% vs ~${sig.perfTrend.baselineMs}ms trailing baseline (${sig.perfTrend.sampleCount} prior runs)</p>` : ''}
          ${sig.details?.length ? `<div class="detail-lines">${sig.details.map(esc).join('\n')}</div>` : ''}
          <div style="margin-top:4px;">${evidenceLinks(sig.evidence)}</div>
        </div>
      </details>`).join('') || '<span class="row-sub">no signals yet</span>'}`;
});

/* ============ Status strip + top chrome ============ */
export function initChrome() {
  const clock = document.getElementById('ss-clock');
  setInterval(() => { clock.textContent = new Date().toLocaleTimeString(); }, 1000);

  // A click on a living-map satellite with something pending briefly
  // highlights the panel with the specifics, instead of piling nodes onto
  // the map or making the user go find it themselves.
  window.addEventListener('qns-flash-panel', (e) => {
    const el = document.querySelector(`.panel[data-panel="${e.detail?.panelId}"]`);
    if (!el) return;
    el.classList.add('panel--flash');
    setTimeout(() => el.classList.remove('panel--flash'), 900);
  });

  subscribe(['health', 'target', 'streamConnected', 'posture', 'actionRequests'], (s) => {
    const svc = document.getElementById('ss-service');
    svc.innerHTML = `QNS <b>${s.health?.ok ? 'healthy' : 'unreachable'}</b> · ${s.health?.runsRecorded ?? 0} runs`;
    svc.className = `status-strip__item ${s.health?.ok ? 'is-good' : 'is-bad'}`;
    const tgt = document.getElementById('ss-target');
    tgt.innerHTML = `target <b>${s.target?.up ? `up · ${s.target.latencyMs}ms` : 'down'}</b>`;
    tgt.className = `status-strip__item ${s.target?.up ? 'is-good' : 'is-bad'}`;
    const str = document.getElementById('ss-stream');
    str.innerHTML = `stream <b>${s.streamConnected ? 'live' : 'reconnecting'}</b>`;
    str.className = `status-strip__item ${s.streamConnected ? 'is-good' : 'is-bad'}`;
    document.getElementById('ss-build').innerHTML = `build <b>${esc(s.health?.build?.label || '—')}</b>`;
    const open = s.actionRequests.filter((a) => a.state === 'open').length;
    document.getElementById('ss-open-ars').innerHTML = `<b>${open}</b> open action${open === 1 ? '' : 's'}`;
    const pill = document.getElementById('top-posture');
    pill.dataset.posture = s.posture?.posture || 'UNKNOWN';
    pill.textContent = s.posture?.posture || 'UNKNOWN';
    document.getElementById('top-app').textContent = `${s.catalog?.app?.name || 'Comparinator'} · local · ${s.health?.build?.label || ''}`;
  });
}

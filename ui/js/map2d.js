/* ============================================================
   THE MAIN QNS VISUALIZATION — the design system's canvas engine,
   ported verbatim from the QNS Design System reference and wired
   to live app logic. The drawing vocabulary (nerves, gradient-tail
   pulses, breathing nodes, layered beating core, gold decision
   flare, parallax) is the design's code, not an imitation.

   Topology: the app-under-test's real component structure (compare-flow,
   metrics, options, counters, dark mode, i18n, security, a11y, …) is
   the hero of the map — labeled, severity-sized, live-status nodes
   spread across the canvas, wired to their agent's real coverage.
   The QNS nervous system (orchestrator, sensor agents, evidence
   memory, human guidance, release gate, bug/fix path, runtime env,
   the app-under-test itself) is a compact cluster orbiting the
   orchestrator core — reachable, sense→decide→act still visible,
   but no longer competing with the app it exists to test.

   App wiring on top of the reference engine:
     · live SSE events route real pulses through the map
     · release posture recolors the gate node only
     · click / arrow-key selection, wheel zoom + drag pan, Fit map
     · prefers-reduced-motion → the reference static render
   ============================================================ */

import { get, set, subscribe } from './store.js';
import { onLiveEvent } from './api.js';
import { agentIconSvg } from './agent-icon.js';

export function initMap(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = get('reducedMotion');

  const css = getComputedStyle(document.documentElement);
  const v = (n, fb) => (css.getPropertyValue(n).trim() || fb);
  const C = {
    discovery: v('--qns-signal-discovery', '#35C6FF'),
    cyan:      v('--qns-accent-cyan', '#22E6D6'),
    memory:    v('--qns-signal-memory', '#35E27A'),
    lime:      v('--qns-signal-memory-lime', '#A9F03C'),
    decision:  v('--qns-signal-decision', '#FFC531'),
    alert:     v('--qns-signal-alert', '#FF6A2C'),
    hot:       v('--qns-signal-alert-hot', '#FF2E4D'),
    human:     v('--qns-signal-human', '#F0F4FF'),
    magenta:   v('--qns-accent-magenta', '#FF2E88'),
    violet:    v('--qns-accent-violet', '#9B6BFF'),
    faint:     v('--qns-ink-faint', 'rgba(236,241,255,0.35)'),
  };

  /* component status (from /api/app-graph) -> a key into C above */
  const COMPONENT_STATUS_COLOR = {
    'pass': 'memory', 'advisory-open': 'decision', 'blocker-open': 'hot', 'never-run': 'faint',
  };

  /* ---- primary layer: the app-under-test's real structure, positioned
     like an actual app map (0..1 normalized coords, insetted to the
     clear zone between rails) — a 4-column grid grouping compare-time
     controls (row 1), the core flow + its output (row 2), post-action
     + access controls (row 3), and cross-cutting concerns (row 4). ---- */
  const COMPONENT_LAYOUT = [
    { id: 'counters' }, { id: 'options' }, { id: 'security' }, { id: 'a11y' },
    { id: 'availability' }, { id: 'compare-flow' }, { id: 'metrics' }, { id: 'runtime-map' },
    { id: 'dark-mode' }, { id: 'controls-reset' }, { id: 'keyboard' }, { id: 'performance' },
    { id: 'i18n' }, { id: 'responsive' }, { id: 'external-suite' },
  ];
  /* structural context only — what real flow feeds what; static, never a pulse */
  const COMPONENT_LINKS = [
    ['availability', 'compare-flow'],
    ['compare-flow', 'metrics'],
    ['options', 'metrics'],
    ['compare-flow', 'controls-reset'],
    ['compare-flow', 'external-suite'],
  ];

  /* ---- the feature flower: the app-under-test's real structure, spread
     across concentric rings around a shared center so it reads as one
     organic cluster of "petals" rather than a fixed grid — and, like the
     nervous-system ring below, naturally re-spaces itself if the catalog
     ever grows or shrinks the component count instead of needing its
     layout hand-redrawn. Inner rings hold fewer nodes than outer ones
     (capacity grows with ring index) so petals don't bunch up near the
     center while the outer ring doesn't end up sparse. */
  const FEATURE_CENTER = { nx: 0.42, ny: 0.48 };
  const FEATURE_RADIUS_X = 0.32; // fraction of the clear-zone width
  const FEATURE_RADIUS_Y = 0.44; // fraction of the clear-zone height
  function ringCapacities(n) {
    const caps = [];
    let remaining = n, i = 0;
    while (remaining > 0) {
      const cap = Math.min(remaining, 6 + i * 4);
      caps.push(cap);
      remaining -= cap;
      i++;
    }
    return caps;
  }

  /* ---- pulse origins: WHAT is actually exercising the feature, not just
     that the orchestrator core is tracking it. Sitting left of the feature
     grid (reading order: origin → feature → core) makes the test's own
     direction of travel legible instead of implying pulses spring from
     the feature itself. The two real sources match the distinction the
     brain already draws between scripted checks and AI-driven exploration
     (see server/brain.mjs#executionModeFor: role 'spider'/'scanner' → AI
     agent, everything else → a scripted Playwright check).

     The other five only exist for the volume demo (simulateDemoLoad) —
     QNS doesn't actually run separate unit/integration/system/perf/mobile
     suites, so showing them outside a demo would fabricate coverage that
     isn't real. `demo: true` marks them; they're laid out up front so
     their positions are stable whenever they do appear, but drawn and
     used as pulse sources only while a demo is running (see demoActive
     below and the demo-pulse case). */
  const ORIGIN_LAYOUT = [
    { id: 'unit-origin',        label: 'Unit Tests',        nx: 0.03, ny: 0.06, c: 'lime',      demo: true },
    { id: 'integration-origin', label: 'Integration Tests', nx: 0.03, ny: 0.20, c: 'discovery', demo: true },
    { id: 'playwright-origin',  label: 'Playwright Tests',  nx: 0.03, ny: 0.35, c: 'cyan' },
    { id: 'system-origin',      label: 'System Tests',      nx: 0.03, ny: 0.49, c: 'decision',  demo: true },
    { id: 'ai-agent-origin',    label: 'AI Agents',         nx: 0.03, ny: 0.63, c: 'violet' },
    { id: 'performance-origin', label: 'Performance Tests', nx: 0.03, ny: 0.78, c: 'magenta',   demo: true },
    { id: 'mobile-origin',      label: 'Mobile Tests',      nx: 0.03, ny: 0.92, c: 'alert',     demo: true },
  ];
  const DEMO_ORIGIN_IDS = ORIGIN_LAYOUT.map((o) => o.id);
  let demoActive = false;
  function originIdForRole(role) {
    return (role === 'spider' || role === 'scanner') ? 'ai-agent-origin' : 'playwright-origin';
  }

  /* ---- secondary layer: the QNS nervous system, compact and orbiting
     the orchestrator core. Human Guidance keeps a distinct, larger
     treatment (halo, top slot) — escalation stays first-class even
     inside a small module. ---- */
  const CLUSTER_ANCHOR = { nx: 0.91, ny: 0.50 };
  const CLUSTER_RADIUS = 82;
  const HUMAN_RADIUS = 150; // Human Guidance sits further out than the rest of the ring
  const CLUSTER_ITEMS = [
    { id: 'app',         label: 'App under test',   c: 'discovery' },
    { id: 'environment', label: 'Runtime Env',      c: 'violet' },
    { id: 'agents',      label: 'Sensor Agents',    c: 'cyan' },
    { id: 'memory',      label: 'Evidence Memory',  c: 'memory' },
    { id: 'gate',        label: 'Gate',             c: 'decision' },
    { id: 'bugfix',      label: 'Bug / Fix Path',   c: 'alert' },
  ];
  const HUMAN = { id: 'human', label: 'Human Guidance', c: 'human' };
  const NODE_ORDER = ['environment', 'app', 'agents', 'orchestrator', 'memory', 'human', 'gate', 'bugfix'];

  let W = 0, H = 0, DPR = 1, nodes = {}, pulses = [], coreEnergy = 0, last = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const curves = new Map();
  const view = { s: 1, ox: 0, oy: 0 };   // zoom / pan
  let appGraph = get('appGraph');        // live component status/coverage
  let catalog = get('catalog');          // component labels + agent severities
  let mapBounds = { x0: 0, x1: 0 };      // inner clear-zone x-range, for label clamping

  // The catalog's full component labels (used in detail panels) are too
  // wide for a 4-per-row grid of 14 nodes — shorten just the ones that
  // would collide with a neighbor; everything else keeps its real label.
  const MAP_LABEL_OVERRIDES = {
    counters: 'Counters', options: 'Options', security: 'Security', a11y: 'Accessibility',
    availability: 'Availability', metrics: 'Metrics', 'runtime-map': 'Runtime UI',
    'dark-mode': 'Dark mode', 'controls-reset': 'Reset control', i18n: 'Localization',
    responsive: 'Responsive', keyboard: 'Keyboard', 'external-suite': 'Test Suite',
  };
  function componentLabel(id) {
    return MAP_LABEL_OVERRIDES[id] || (catalog?.components || []).find((c) => c.id === id)?.label || id;
  }
  function severityRadius(id) {
    const sev = (catalog?.agents || []).find((a) => a.component === id)?.severityOnFail;
    return sev === 'blocker' ? 9 : sev === 'warning' ? 7 : 5.5;
  }

  function layout() {
    // inset the graph to the clear zone between the instrument rails so
    // every node stays visible; re-flows when rails resize or collapse
    const railL = document.getElementById('rail-left')?.offsetWidth || 0;
    const railR = document.getElementById('rail-right')?.offsetWidth || 0;
    const padX = Math.min(70, W * 0.04), padY = 44;
    const x0 = railL + padX, x1 = W - railR - padX;
    mapBounds = { x0, x1 };
    const place = (n) => ({ ...n,
      x: x0 + n.nx * (x1 - x0),
      y: padY + n.ny * (H - padY * 2),
      flash: 0, phase: Math.random() * 6.28 });

    nodes = {};
    layoutFeatureFlower(x0, x1, H, padY);
    ORIGIN_LAYOUT.forEach((o) => { nodes[o.id] = place({ id: o.id, nx: o.nx, ny: o.ny, label: o.label, c: o.c }); });
    nodes.orchestrator = place({ id: 'orchestrator', nx: CLUSTER_ANCHOR.nx, ny: CLUSTER_ANCHOR.ny, label: 'QNS Orchestrator' });
    curves.clear();
    layoutCluster();
    refreshComponentMeta();
    applyAppGraphStatus();
  }

  /* concentric rings of feature "petals" around a shared center — see
     the FEATURE_CENTER/ringCapacities comment above */
  function layoutFeatureFlower(x0, x1, H, padY) {
    const cx = x0 + (x1 - x0) * FEATURE_CENTER.nx;
    const cy = padY + (H - padY * 2) * FEATURE_CENTER.ny;
    const rx = (x1 - x0) * FEATURE_RADIUS_X;
    const ry = (H - padY * 2) * FEATURE_RADIUS_Y;
    const caps = ringCapacities(COMPONENT_LAYOUT.length);
    let idx = 0;
    caps.forEach((cap, ring) => {
      const frac = (ring + 1) / caps.length;
      const stagger = (ring % 2) * (Math.PI / cap); // interleave rings, not spokes
      for (let k = 0; k < cap; k++) {
        const c = COMPONENT_LAYOUT[idx];
        const angle = -Math.PI / 2 + stagger + (k / cap) * Math.PI * 2;
        const prior = nodes[c.id];
        nodes[c.id] = { id: c.id,
          x: cx + Math.cos(angle) * rx * frac, y: cy + Math.sin(angle) * ry * frac,
          angle, flash: prior?.flash || 0, phase: prior?.phase ?? Math.random() * 6.28 };
        idx++;
      }
    });
  }

  /* the nervous system: a compact ring of small nodes orbiting the core */
  function layoutCluster() {
    const core = nodes.orchestrator;
    if (!core) return;
    const items = [HUMAN, ...CLUSTER_ITEMS];
    const n = items.length;
    items.forEach((it, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const prior = nodes[it.id];
      const radius = it.id === 'human' ? HUMAN_RADIUS : CLUSTER_RADIUS;
      nodes[it.id] = { ...it,
        size: it.id === 'human' ? 8 : 5,
        angle,
        x: core.x + radius * Math.cos(angle), y: core.y + radius * Math.sin(angle),
        flash: prior?.flash || 0, phase: prior?.phase ?? Math.random() * 6.28 };
    });
  }

  /* component labels/sizes come from the catalog (real severity), never
     fabricated — falls back to id/mid-size until the catalog loads */
  function refreshComponentMeta() {
    for (const c of COMPONENT_LAYOUT) {
      const n = nodes[c.id];
      if (!n) continue;
      n.label = componentLabel(c.id);
      n.size = severityRadius(c.id);
    }
    if (nodes.app && catalog?.app?.name) nodes.app.label = catalog.app.name;
  }

  /* component status/coverage comes from /api/app-graph — real runs only */
  function applyAppGraphStatus() {
    for (const c of (appGraph?.components || [])) {
      const n = nodes[c.id];
      if (!n) continue;
      n.status = c.status;
      n.hasSecondarySignal = c.hasSecondarySignal;
      n.agentId = c.agentId;
      n.issue = c.issue || null;
    }
    syncIssueBadges();
  }

  /* ---- AI agent badges: one real <button> per component with an open
     blocker/warning. HTML (not canvas) so they're focusable, labelled and
     clickable; positioned over the node every frame so they ride zoom,
     pan and parallax with it. Clicking one opens the Claude chat about
     that issue. Proof issues carry a PROOF tag — never passed off as live. */
  const badgeLayer = document.createElement('div');
  badgeLayer.className = 'map-issue-layer';
  canvas.insertAdjacentElement('afterend', badgeLayer);
  const badges = new Map(); // componentId -> button

  function syncIssueBadges() {
    for (const c of COMPONENT_LAYOUT) {
      const n = nodes[c.id];
      const issue = n?.issue;
      let btn = badges.get(c.id);
      if (!issue) { if (btn) { btn.remove(); badges.delete(c.id); } continue; }
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'map-agent-badge';
        btn.innerHTML = agentIconSvg() + '<span class="map-agent-badge__proof" hidden>proof</span>';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('qns-open-chat', { detail: { componentId: c.id, invoker: btn } }));
        });
        badgeLayer.appendChild(btn);
        badges.set(c.id, btn);
      }
      const label = componentLabel(c.id);
      btn.dataset.severity = issue.severity;
      btn.classList.toggle('is-proof', !!issue.proof);
      btn.querySelector('.map-agent-badge__proof').hidden = !issue.proof;
      const what = issue.proof ? `controlled proof “${issue.proofName}”` : issue.severity;
      btn.setAttribute('aria-label', `Ask Claude about ${label} — ${what}`);
      btn.title = `${label}: ${issue.title}\nAsk Claude to review this issue`;
    }
    positionBadges();
  }

  function positionBadges() {
    if (!badges.size) return;
    const parallax = (view.s === 1 && !view.ox && !view.oy) ? 10 : 0;
    for (const [id, btn] of badges) {
      const n = nodes[id];
      if (!n) continue;
      // sit on the side opposite the node's radial label, so it never covers it
      const d = (n.size || 6) + 13;
      const a = (n.angle ?? -Math.PI / 4) + Math.PI;
      const sx = view.ox + view.s * (n.x + mouse.x * parallax + Math.cos(a) * d);
      const sy = view.oy + view.s * (n.y + mouse.y * parallax + Math.sin(a) * d);
      btn.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  subscribe(['appGraph'], (s) => { appGraph = s.appGraph; applyAppGraphStatus(); if (reduce) staticRender(); });
  subscribe(['catalog'], (s) => { catalog = s.catalog; refreshComponentMeta(); if (reduce) staticRender(); });

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
    if (reduce) staticRender();
  }

  /* deterministic organic control point per ordered pair (reference code) */
  function curve(fromId, toId) {
    const key = fromId + '>' + toId;
    if (curves.has(key)) return curves.get(key);
    const a = nodes[fromId], b = nodes[toId];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const sign = (h & 1) ? 1 : -1;
    const off = sign * Math.min(len * 0.28, 120) * (0.5 + (h % 100) / 200);
    const cp = { ax: a.x, ay: a.y, bx: b.x, by: b.y,
                 cx: mx + (-dy / len) * off, cy: my + (dx / len) * off };
    curves.set(key, cp); return cp;
  }
  function at(cp, t) { const u = 1 - t; return {
    x: u * u * cp.ax + 2 * u * t * cp.cx + t * t * cp.bx,
    y: u * u * cp.ay + 2 * u * t * cp.cy + t * t * cp.by }; }

  // hard ceiling on concurrently-alive pulses — bounds per-frame draw cost
  // no matter how fast something upstream (a demo flood, a live burst)
  // emits. Dropping the oldest is safe: it's already nearest its
  // destination, so its "arrival" (a node flash / core-energy tick) is
  // seconds away from happening anyway.
  const MAX_PULSES = 220;
  // `next` (optional): { toId, kind, color, speed, size, next? } — fired as
  // a follow-on emit() the instant this pulse arrives, so a single logical
  // event can relay across more than one hop (origin → feature → core)
  // while still reading as one continuous trip, not two coincidental ones.
  function emit(fromId, toId, kind, color, speed, size, next) {
    if (pulses.length >= MAX_PULSES) pulses.shift();
    pulses.push({ fromId, toId, t: 0, kind, color, speed: speed || 0.4,
                  size: size || (2 + Math.random() * 1.6), next: next || null });
  }

  /* ---- arrivals: every pulse on this map is a real event ----
     No fabricated activity: the reference engine's demo loop (random
     decisions, 16% escalations, random efferent pulses) is removed.
     Motion means something happened. */
  function arrive(p) {
    if (p.kind === 'sense') { coreEnergy = Math.min(7, coreEnergy + 0.15); }               // live monitoring heartbeat
    else if (p.kind === 'escalate') { nodes.human.flash = 1; }                              // decision pending a human
    else if (p.kind === 'guidance') { coreEnergy = Math.min(7, coreEnergy + 1.4); nodes.orchestrator.flash = 1; } // a human decided
    else { (nodes[p.toId] || nodes.orchestrator).flash = 1; coreEnergy = Math.min(7, coreEnergy + 1.2); }
    if (p.next) emit(p.toId, p.next.toId, p.next.kind, p.next.color, p.next.speed, p.next.size, p.next.next);
  }

  /* ---- live app events: real signals ride the same nerves ----
     Agent start/finish pulses travel from the specific component the
     agent covers, straight to the core — the map's longest, most
     visible pulses are tied to the real thing being tested. */
  onLiveEvent((evt) => {
    if (reduce) return;
    switch (evt.type) {
      case 'run-started':
        emit('environment', 'orchestrator', 'live', C.violet, 0.5, 2.6);
        emit('app', 'orchestrator', 'live', C.discovery, 0.45, 2.6);
        break;
      case 'agent-started': {
        const agentDef = catalog?.agents?.find((a) => a.id === evt.agentId);
        const compId = agentDef?.component;
        const originId = agentDef && originIdForRole(agentDef.role);
        if (compId && nodes[compId] && originId && nodes[originId]) {
          // origin → feature → core: one relayed trip, not a pulse that
          // springs from the feature itself
          emit(originId, compId, 'live', C.discovery, 0.6, 2.0,
            { toId: 'orchestrator', kind: 'live', color: C.discovery, speed: 0.42, size: 2.4 });
        } else if (compId && nodes[compId]) {
          emit(compId, 'orchestrator', 'live', C.discovery, 0.42, 2.4);
        } else {
          emit('agents', 'orchestrator', 'live', C.discovery, 0.55, 2.2);
        }
        nodes.agents.flash = 1;
        break;
      }
      case 'agent-finished': {
        const col = evt.status === 'fail' ? C.hot : evt.status === 'degraded' ? C.decision : C.cyan;
        const agentDef = catalog?.agents?.find((a) => a.id === evt.agentId);
        const compId = agentDef?.component;
        const originId = agentDef && originIdForRole(agentDef.role);
        if (compId && nodes[compId] && originId && nodes[originId]) {
          emit(originId, compId, 'live', col, 0.7, 2.4,
            { toId: 'orchestrator', kind: 'live', color: col, speed: 0.5, size: 3.2 });
        } else if (compId && nodes[compId]) {
          nodes[compId].flash = 1;
          emit(compId, 'orchestrator', 'live', col, 0.5, 3.2);
        } else {
          emit('agents', 'orchestrator', 'live', col, 0.5, 3.2);
        }
        emit('orchestrator', 'memory', 'live', C.memory, 0.4, 2.2);   // evidence written
        break;
      }
      case 'run-finished': {
        const col = evt.posture === 'NO-GO' ? C.hot : evt.posture === 'CONDITIONAL' ? C.decision : C.memory;
        emit('orchestrator', 'gate', 'live', col, 0.5, 3.6);
        if (evt.posture === 'NO-GO' || evt.posture === 'CONDITIONAL') {
          emit('orchestrator', 'human', 'escalate', C.human, 0.5, 3);
          emit('orchestrator', 'bugfix', 'live', C.hot, 0.45, 2.6);
        }
        break;
      }
      case 'artifact':
        // a human approved a draft: guidance returns, then the draft flows out
        emit('human', 'orchestrator', 'guidance', C.human, 0.5, 2.4);
        emit('orchestrator', 'bugfix', 'live', C.magenta, 0.5, 3);
        break;
      case 'action-request-updated':
        // accept-risk / dismiss / rerun — a human decision came back
        emit('human', 'orchestrator', 'guidance', C.human, 0.5, 2.4);
        break;
      case 'heartbeat':
        // the SSE stream's real 5s heartbeat: the only idle pulse, and it is
        // honest — QNS is live-monitoring. Faint, slow, environmental.
        emit('environment', 'orchestrator', 'sense', C.violet, 0.22, 1.4);
        break;
      // demo-started / demo-finished: only bracket for the fictional
      // unit/integration/system/perf/mobile origins — QNS doesn't actually
      // run those suites, so they only appear while a demo makes that
      // explicit (toasted in api.js as "visual only — no real signal").
      case 'demo-started':
        demoActive = true;
        break;
      case 'demo-finished':
        demoActive = false;
        break;
      // demo-pulse: visual-only, for live demos at volume. Distinct event
      // type from every real one above — never confused with a real agent
      // run (see engine.mjs#simulateDemoLoad). Reuses the same pulse
      // language as agent-started/agent-finished on purpose, so a demo
      // audience sees the map behave exactly as it would under real load.
      // The origin is picked at random from all seven origin nodes (not
      // derived from the component's real agent) — the demo is already
      // fabricating volume, and rotating through every origin is what
      // makes the extra demo-only nodes visibly earn their place.
      case 'demo-pulse': {
        const compId = evt.component;
        const originId = DEMO_ORIGIN_IDS[Math.floor(Math.random() * DEMO_ORIGIN_IDS.length)];
        if (evt.phase === 'start') {
          if (compId && nodes[compId] && originId && nodes[originId]) {
            emit(originId, compId, 'live', C.discovery, 0.6, 2.0,
              { toId: 'orchestrator', kind: 'live', color: C.discovery, speed: 0.42, size: 2.4 });
          } else if (compId && nodes[compId]) {
            emit(compId, 'orchestrator', 'live', C.discovery, 0.42, 2.4);
          }
          nodes.agents.flash = 1;
        } else if (evt.phase === 'finish') {
          const col = evt.status === 'fail' ? C.hot : evt.status === 'degraded' ? C.decision : C.cyan;
          if (compId && nodes[compId] && originId && nodes[originId]) {
            emit(originId, compId, 'live', col, 0.7, 2.4,
              { toId: 'orchestrator', kind: 'live', color: col, speed: 0.5, size: 3.2 });
          } else if (compId && nodes[compId]) {
            nodes[compId].flash = 1;
            emit(compId, 'orchestrator', 'live', col, 0.5, 3.2);
          }
          emit('orchestrator', 'memory', 'live', C.memory, 0.4, 2.2);
        }
        break;
      }
    }
  });

  /* posture recolors the release gate only — never a global wash */
  subscribe(['posture'], (s) => {
    const p = s.posture?.posture;
    const col = p === 'NO-GO' ? 'hot' : p === 'CONDITIONAL' ? 'decision' : p === 'GO' ? 'memory' : 'decision';
    const src = CLUSTER_ITEMS.find((o) => o.id === 'gate');
    if (src) src.c = col;
    if (nodes.gate) nodes.gate.c = col;
    if (reduce) staticRender();
  });

  /* ---- drawing (reference code) ---- */
  function nerve(fromId, toId, alpha) {
    const cp = curve(fromId, toId);
    ctx.beginPath(); ctx.moveTo(cp.ax, cp.ay); ctx.quadraticCurveTo(cp.cx, cp.cy, cp.bx, cp.by);
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.lineWidth = 1; ctx.stroke();
  }

  // shadowBlur is GPU-rasterized per shape, not free just because it isn't
  // on the JS main thread: profiling showed the page's own script never
  // exceeded 30ms/frame and threw zero PerformanceObserver longtasks, yet
  // the tab still collapsed to ~1fps under a pulse flood — the Chrome GPU
  // process itself was pegged at 50-95% CPU. With up to MAX_PULSES alive,
  // each drawing a shadowed arc *and* a shadowed line every frame at up to
  // 2x DPR, that's 400+ blurred draws/frame, which is what saturated it.
  // Pulses already render with globalCompositeOperation 'lighter' (additive
  // blending), which gives a glow on its own — so they skip shadowBlur
  // entirely; only the sparse, fixed-count nodes still use it.
  function drawPulse(p) {
    const cp = curve(p.fromId, p.toId);
    const head = at(cp, p.t);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(head.x, head.y, p.size, 0, 6.2832); ctx.fill();
    const tt = Math.max(0, p.t - 0.06), tail = at(cp, tt);
    ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.9; ctx.lineCap = 'round';
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // shared by any node laid out on a ring (cluster nodes, feature petals):
  // point the label outward along the node's own angle instead of
  // stacking every label above its node, so ring neighbors don't collide
  function drawRadialLabel(n, r, text, outwardPad, guardX) {
    if (n.angle != null) {
      const off = r + outwardPad;
      let lx = n.x + Math.cos(n.angle) * off; const ly = n.y + Math.sin(n.angle) * off;
      let align = Math.cos(n.angle) > 0.35 ? 'left' : Math.cos(n.angle) < -0.35 ? 'right' : 'center';
      // a long label on the outward side can run past the rail — clamp it
      // back inside the clear zone rather than let it render underneath
      const w = ctx.measureText(text).width;
      if (align === 'left' && lx + w > mapBounds.x1 - 4) { lx = mapBounds.x1 - 4 - w; }
      else if (align === 'right' && lx - w < mapBounds.x0 + 4) { lx = mapBounds.x0 + 4 + w; }
      // feature petals facing the orchestrator point their label straight at
      // its cluster ring — pull those back too, independent of how tight
      // the flower itself is, so shrinking the flower is never the fix
      if (guardX != null && align === 'left' && lx + w > guardX) { lx = guardX - w; }
      ctx.textAlign = align;
      ctx.textBaseline = Math.sin(n.angle) > 0.35 ? 'top' : Math.sin(n.angle) < -0.35 ? 'bottom' : 'middle';
      ctx.fillText(text, lx, ly);
      ctx.textBaseline = 'alphabetic';
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(text, n.x, n.y - (r + 9));
    }
  }

  /* nervous-system cluster node (small, category-colored) */
  function drawNode(n, time) {
    const col = C[n.c] || '#fff';
    const base = n.size || 5;
    const r = base + Math.sin(time * 1.4 + n.phase) * 0.7 + n.flash * 3;
    const isHuman = n.id === 'human';
    if (isHuman) {
      const hr = r * 3.4;
      const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, hr);
      halo.addColorStop(0, 'rgba(240,244,255,' + (0.22 + n.flash * 0.18) + ')');
      halo.addColorStop(1, 'rgba(240,244,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(n.x, n.y, hr, 0, 6.2832); ctx.fill();
    }
    ctx.save();
    ctx.shadowBlur = (isHuman ? 26 : 14) + n.flash * 18; ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.2832); ctx.fill();
    if (isHuman) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.4, 0, 6.2832); ctx.fill(); }
    ctx.restore();
    // selection ring
    if (get('selectedNodeId') === n.id) {
      ctx.save();
      ctx.strokeStyle = C.discovery; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 8, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(236,241,255,' + (0.55 + n.flash * 0.4) + ')';
    ctx.font = (isHuman ? '700 12px Sora' : '600 10px Manrope') + ', system-ui, sans-serif';
    drawRadialLabel(n, r, n.label, isHuman ? 16 : 12);
    n.flash *= 0.9;
  }

  /* primary component node — the hero of the map: labeled, sized by
     real release-blocking severity, colored by real live status. */
  function drawComponentNode(n, time) {
    if (!n) return;
    // an open issue (live or labeled proof) wins over the live-only status color
    const issueCol = n.issue ? (n.issue.severity === 'blocker' ? C.hot : C.decision) : null;
    const col = issueCol || C[COMPONENT_STATUS_COLOR[n.status]] || C.faint;
    const neverRun = n.status === 'never-run' && !n.issue;
    const base = n.size || 6;
    const r = base + Math.sin(time * 1.3 + n.phase) * 0.5 + n.flash * 3;
    ctx.save();
    ctx.shadowBlur = 14 + n.flash * 18; ctx.shadowColor = col;
    if (neverRun) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.2832); ctx.stroke();
    } else {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    // open issue: a slow alarm ring (state, not a fabricated event) —
    // dashed when the defect was injected by a controlled proof
    if (n.issue) {
      const k = (Math.sin(time * 2.2 + n.phase) + 1) / 2;
      ctx.save();
      ctx.strokeStyle = issueCol; ctx.globalAlpha = 0.35 + k * 0.4; ctx.lineWidth = 1.6;
      if (n.issue.proof) ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 + k * 3, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    // small cyan badge: a human is needed here (open/historical bug,
    // perf regression, or visual diff) — grouped, not itemized
    if (n.hasSecondarySignal) {
      const br = 2.2 + Math.sin(time * 3 + n.phase) * 0.5;
      ctx.save();
      ctx.shadowBlur = 6; ctx.shadowColor = C.cyan; ctx.fillStyle = C.cyan;
      ctx.beginPath(); ctx.arc(n.x + r + 3, n.y - r - 3, br, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    if (get('selectedComponentId') === n.id) {
      ctx.save();
      ctx.strokeStyle = C.discovery; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 7, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(236,241,255,' + (0.62 + n.flash * 0.35) + ')';
    ctx.font = '600 12px Manrope, system-ui, sans-serif';
    const clusterGuardX = nodes.orchestrator ? nodes.orchestrator.x - CLUSTER_RADIUS - 36 : null;
    drawRadialLabel(n, r, n.label || n.id, 9, clusterGuardX);
    n.flash *= 0.9;
  }

  function drawCore(time) {
    const n = nodes.orchestrator;
    const beat = 1 + Math.sin(time * 1.7) * 0.09 + coreEnergy * 0.05;
    const r = 13 * beat;
    const hr = r * 5.5;
    const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, hr);
    halo.addColorStop(0, 'rgba(180,220,255,' + (0.28 + coreEnergy * 0.05) + ')');
    halo.addColorStop(0.4, 'rgba(53,198,255,0.12)');
    halo.addColorStop(1, 'rgba(46,134,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(n.x, n.y, hr, 0, 6.2832); ctx.fill();
    if (coreEnergy > 0.4) {   // gold decision flare
      const fr = r * 3.4;
      const flare = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, fr);
      const a = Math.min(0.5, coreEnergy * 0.09);
      flare.addColorStop(0, 'rgba(255,197,49,' + a + ')');
      flare.addColorStop(1, 'rgba(255,197,49,0)');
      ctx.fillStyle = flare; ctx.beginPath(); ctx.arc(n.x, n.y, fr, 0, 6.2832); ctx.fill();
    }
    ctx.save();
    ctx.shadowBlur = 40; ctx.shadowColor = C.discovery;
    ctx.fillStyle = '#EAF3FF';
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.42, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (get('selectedNodeId') === n.id) {
      ctx.save();
      ctx.strokeStyle = C.discovery; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 10, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(236,241,255,0.85)';
    ctx.font = '700 12px Sora, system-ui, sans-serif'; ctx.textAlign = 'center';
    // above, not below — below is where the cluster ring's own labels sit
    ctx.fillText(n.label, n.x, n.y - r - 16);
  }

  function drawScene(time, dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);
    if (view.s === 1 && !view.ox && !view.oy) ctx.translate(mouse.x * 10, mouse.y * 10);

    ctx.globalCompositeOperation = 'source-over';
    COMPONENT_LINKS.forEach(([a, b]) => nerve(a, b, 0.09));       // real app flow, static
    COMPONENT_LAYOUT.forEach((c) => nerve(c.id, 'orchestrator', 0.05)); // sense pathway
    CLUSTER_ITEMS.forEach((it) => nerve(it.id, 'orchestrator', 0.08));
    nerve('orchestrator', 'human', 0.1);

    if (dt != null) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.speed * dt;
        if (p.t >= 1) { arrive(p); pulses.splice(i, 1); continue; }
        drawPulse(p);
      }
      coreEnergy *= Math.pow(0.35, dt);
    }

    ctx.globalCompositeOperation = 'source-over';
    COMPONENT_LAYOUT.forEach((c) => drawComponentNode(nodes[c.id], time));
    ORIGIN_LAYOUT.forEach((o) => { if (!o.demo || demoActive) drawNode(nodes[o.id], time); });
    CLUSTER_ITEMS.forEach((it) => drawNode(nodes[it.id], time));
    drawNode(nodes.human, time);
    drawCore(time);
    ctx.restore();
    positionBadges();
  }

  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
    drawScene(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  /* reduced motion: the reference's frozen long-exposure render */
  function staticRender() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(view.ox, view.oy); ctx.scale(view.s, view.s);
    COMPONENT_LINKS.forEach(([a, b]) => nerve(a, b, 0.12));
    COMPONENT_LAYOUT.forEach((c) => nerve(c.id, 'orchestrator', 0.08));
    CLUSTER_ITEMS.forEach((it) => nerve(it.id, 'orchestrator', 0.12));
    nerve('orchestrator', 'human', 0.14);
    ctx.globalCompositeOperation = 'lighter';
    const frozen = [];
    CLUSTER_ITEMS.forEach((it) => frozen.push({ fromId: it.id, toId: 'orchestrator', color: C[it.c], t: 0.5, size: 2.4 }));
    frozen.forEach(drawPulse);
    ctx.globalCompositeOperation = 'source-over';
    COMPONENT_LAYOUT.forEach((c) => drawComponentNode(nodes[c.id], 0));
    ORIGIN_LAYOUT.forEach((o) => { if (!o.demo) drawNode(nodes[o.id], 0); });
    CLUSTER_ITEMS.forEach((it) => drawNode(nodes[it.id], 0));
    drawNode(nodes.human, 0); drawCore(0);
    ctx.restore();
    positionBadges();
  }

  /* ---- interaction: select, zoom, pan, keyboard, fit ---- */
  const toWorld = (px, py) => ({ x: (px - view.ox) / view.s, y: (py - view.oy) / view.s });
  let down = null, panned = false;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; panned = false; });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / r.width - 0.5;
    mouse.ty = (e.clientY - r.top) / r.height - 0.5;
    if (down && (Math.abs(e.clientX - down.x) > 6 || Math.abs(e.clientY - down.y) > 6)) {
      panned = true;
      view.ox = down.ox + (e.clientX - down.x);
      view.oy = down.oy + (e.clientY - down.y);
      if (reduce) staticRender();
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const wasPan = panned; down = null; panned = false;
    if (wasPan) return;
    const r = canvas.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);

    // primary components first — the hero of the map, bigger targets
    for (const c of COMPONENT_LAYOUT) {
      const n = nodes[c.id];
      if (!n) continue;
      const hitR = (n.size || 6) + 9;
      if (Math.hypot(w.x - n.x, w.y - n.y) <= hitR) {
        const cur = get('selectedComponentId');
        const next = cur === c.id ? null : c.id;
        set({ selectedComponentId: next });
        if (next && n.hasSecondarySignal) {
          window.dispatchEvent(new CustomEvent('qns-flash-panel', { detail: { panelId: 'component-detail' } }));
        }
        if (reduce) staticRender();
        return;
      }
    }

    let hit = null;
    for (const id of NODE_ORDER) {
      const n = nodes[id];
      if (!n) continue;
      const nr = (id === 'orchestrator' ? 16 : (n.size || 5)) + 10;
      if (Math.hypot(w.x - n.x, w.y - n.y) <= nr) { hit = id; break; }
    }
    set({ selectedNodeId: hit });
    if (reduce) staticRender();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const w = toWorld(px, py);
    view.s = Math.max(0.6, Math.min(2.6, view.s * Math.exp(-e.deltaY * 0.0012)));
    view.ox = px - w.x * view.s;
    view.oy = py - w.y * view.s;
    if (reduce) staticRender();
  }, { passive: false });

  canvas.addEventListener('keydown', (e) => {
    const cur = get('selectedNodeId');
    const idx = NODE_ORDER.indexOf(cur);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault(); set({ selectedNodeId: NODE_ORDER[(idx + 1 + NODE_ORDER.length) % NODE_ORDER.length] });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); set({ selectedNodeId: NODE_ORDER[(idx - 1 + NODE_ORDER.length) % NODE_ORDER.length] });
    } else if (e.key === 'f' || e.key === 'F') {
      fitMap();
    }
    if (reduce) staticRender();
  });

  function fitMap() { view.s = 1; view.ox = 0; view.oy = 0; if (reduce) staticRender(); }
  window.addEventListener('qns-fit-map', fitMap);
  window.addEventListener('qns-default-view', fitMap);
  subscribe(['selectedNodeId', 'selectedComponentId'], () => { if (reduce) staticRender(); });

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  for (const railId of ['rail-left', 'rail-right']) {
    const rail = document.getElementById(railId);
    if (rail) ro.observe(rail);
  }
  resize();
  if (!reduce) requestAnimationFrame(frame);

  return { fitMap };
}

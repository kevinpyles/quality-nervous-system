/* ============================================================
   Adjustable cockpit layout — a panel registry, not a fixed
   arrangement. Panels reorder within a rail, move between
   rails, collapse, and rails resize; everything persists to
   localStorage. The 3D map is the fixed central anchor and is
   never part of the registry. (Requirements §Adjustable cockpit layout)
   ============================================================ */

const LS_KEY = 'qns-cockpit-layout-v2'; // bumped: load() replaces the saved layout
// wholesale, so a new default panel never appears for a browser with a v1
// layout already saved unless the key changes.

export const DEFAULT_LAYOUT = {
  rails: { left: 330, right: 360 },
  panels: [
    { id: 'release-posture', zone: 'left',  order: 0, collapsed: false },
    { id: 'active-failure',  zone: 'left',  order: 1, collapsed: false },
    { id: 'run-controls',    zone: 'left',  order: 2, collapsed: false },
    { id: 'selected-node',   zone: 'left',  order: 3, collapsed: false },
    { id: 'coverage-staleness', zone: 'left', order: 4, collapsed: false },
    { id: 'agents',          zone: 'right', order: 0, collapsed: false },
    { id: 'selected-agent',  zone: 'right', order: 1, collapsed: false },
    { id: 'run-history',     zone: 'right', order: 2, collapsed: false },
    { id: 'run-details',     zone: 'right', order: 3, collapsed: false },
    { id: 'aut-graph',       zone: 'right', order: 4, collapsed: false },
    { id: 'component-detail', zone: 'right', order: 5, collapsed: false },
  ],
};

export const PANEL_TITLES = {
  'release-posture': 'Release posture',
  'active-failure':  'Active failure',
  'run-controls':    'Run controls',
  'selected-node':   'Selected node',
  'coverage-staleness': 'Coverage & staleness',
  'agents':          'Agents',
  'selected-agent':  'Selected agent',
  'run-history':     'Test run history',
  'run-details':     'Run details',
  'component-detail': 'Component detail',
  'aut-graph':       'App-under-test graph',
};

let layout = load();
const renderers = new Map(); // panelId -> render(bodyEl)

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved?.panels?.length) return saved;
  } catch { /* fresh */ }
  return structuredClone(DEFAULT_LAYOUT);
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(layout)); }

export function resetLayout() {
  layout = structuredClone(DEFAULT_LAYOUT);
  save();
  mountAll();
}

export function registerPanel(id, renderFn) { renderers.set(id, renderFn); }

export function getPanelBody(id) {
  return document.querySelector(`.panel[data-panel="${id}"] .panel__body`);
}

/* ---------- DOM construction ---------- */
function buildPanel(p) {
  const el = document.createElement('section');
  el.className = 'panel' + (p.collapsed ? ' is-collapsed' : '');
  el.dataset.panel = p.id;
  el.innerHTML = `
    <header class="panel__head" draggable="true">
      <span class="panel__grip" aria-hidden="true">⠿</span>
      <span class="panel__title">${PANEL_TITLES[p.id]}</span>
      <button class="panel__btn" data-act="move" title="Move to the other rail">⇄</button>
      <button class="panel__btn" data-act="collapse" title="Collapse / expand" aria-expanded="${!p.collapsed}">${p.collapsed ? '▸' : '▾'}</button>
    </header>
    <div class="panel__body"></div>`;

  el.querySelector('[data-act="collapse"]').addEventListener('click', () => {
    p.collapsed = !p.collapsed;
    el.classList.toggle('is-collapsed', p.collapsed);
    el.querySelector('[data-act="collapse"]').textContent = p.collapsed ? '▸' : '▾';
    save();
  });
  el.querySelector('[data-act="move"]').addEventListener('click', () => {
    p.zone = p.zone === 'left' ? 'right' : 'left';
    p.order = 99;
    normalizeOrders(); save(); mountAll();
  });

  const head = el.querySelector('.panel__head');
  head.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/qns-panel', p.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('text/qns-panel')) { e.preventDefault(); el.classList.add('is-dragover'); }
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-dragover'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('is-dragover');
    const draggedId = e.dataTransfer.getData('text/qns-panel');
    if (!draggedId || draggedId === p.id) return;
    e.preventDefault();
    const dragged = layout.panels.find((x) => x.id === draggedId);
    dragged.zone = p.zone;
    dragged.order = p.order - 0.5; // insert before the drop target
    normalizeOrders(); save(); mountAll();
  });
  return el;
}

function normalizeOrders() {
  for (const zone of ['left', 'right']) {
    layout.panels
      .filter((x) => x.zone === zone)
      .sort((a, b) => a.order - b.order)
      .forEach((x, i) => { x.order = i; });
  }
}

export function mountAll() {
  for (const zone of ['left', 'right']) {
    const rail = document.getElementById(`rail-${zone}`);
    rail.style.setProperty('--rail-width', layout.rails[zone] + 'px');
    rail.querySelectorAll('.panel').forEach((el) => el.remove());
    layout.panels
      .filter((p) => p.zone === zone)
      .sort((a, b) => a.order - b.order)
      .forEach((p) => {
        const el = buildPanel(p);
        rail.appendChild(el);
        renderers.get(p.id)?.(el.querySelector('.panel__body'));
      });
  }
  // rails accept drops on empty space (append to end)
  for (const zone of ['left', 'right']) {
    const rail = document.getElementById(`rail-${zone}`);
    rail.ondragover = (e) => { if (e.dataTransfer.types.includes('text/qns-panel')) e.preventDefault(); };
    rail.ondrop = (e) => {
      const draggedId = e.dataTransfer.getData('text/qns-panel');
      if (!draggedId || e.target.closest('.panel')) return;
      const dragged = layout.panels.find((x) => x.id === draggedId);
      dragged.zone = zone; dragged.order = 99;
      normalizeOrders(); save(); mountAll();
    };
  }
}

/* ---------- rail resize ---------- */
export function initRailResize() {
  document.querySelectorAll('.rail__resize').forEach((handle) => {
    const zone = handle.dataset.rail;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = layout.rails[zone];
      const move = (ev) => {
        const dx = ev.clientX - startX;
        const w = Math.max(240, Math.min(window.innerWidth * 0.44,
          zone === 'left' ? startW + dx : startW - dx));
        layout.rails[zone] = Math.round(w);
        document.getElementById(`rail-${zone}`).style.setProperty('--rail-width', layout.rails[zone] + 'px');
      };
      const up = () => {
        save();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}

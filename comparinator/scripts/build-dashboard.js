#!/usr/bin/env node
'use strict';

// Parses the Playwright JSON reporter output, appends this run to a
// persisted run-history file, and renders a static HTML dashboard.
// Re-run automatically after every `npm test` so the dashboard always
// reflects the latest run plus how the app's test health has trended.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'test-results', 'results.json');
const REPORTS_DIR = path.join(ROOT, 'reports');
const HISTORY_PATH = path.join(REPORTS_DIR, 'history.json');
const DASHBOARD_PATH = path.join(REPORTS_DIR, 'dashboard.html');
const MAX_HISTORY_RUNS = 50;
const APP_NAME = 'Comparinator';

function loadResults() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error(`No results file found at ${RESULTS_PATH}. Run "npm test" first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
}

function categoryFromFile(file) {
  const base = file.replace(/^\d+-/, '').replace(/\.spec\.js$/, '');
  return base.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function normalizeStatus(status) {
  if (status === 'expected') return 'passed';
  if (status === 'unexpected') return 'failed';
  if (status === 'flaky') return 'flaky';
  return 'skipped';
}

function collectSpecs(suites, out) {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      const test = spec.tests[0];
      const idMatch = spec.title.match(/^TC-(\d+)/);
      out.push({
        tc: idMatch ? `TC-${idMatch[1]}` : null,
        tcNum: idMatch ? parseInt(idMatch[1], 10) : Number.MAX_SAFE_INTEGER,
        title: spec.title,
        category: categoryFromFile(spec.file),
        status: normalizeStatus(test.status),
        durationMs: (test.results || []).reduce((sum, r) => sum + (r.duration || 0), 0),
      });
    }
    if (suite.suites) collectSpecs(suite.suites, out);
  }
  return out;
}

function buildRun(data, tests) {
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const flaky = tests.filter((t) => t.status === 'flaky').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  const total = tests.length;
  const passRate = total ? Number((((passed + flaky) / total) * 100).toFixed(1)) : 0;

  return {
    timestamp: data.stats.startTime,
    durationMs: Math.round(data.stats.duration),
    total,
    passed,
    failed,
    flaky,
    skipped,
    passRate,
  };
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function groupByCategory(tests) {
  const map = new Map();
  for (const t of tests) {
    if (!map.has(t.category)) map.set(t.category, []);
    map.get(t.category).push(t);
  }
  for (const list of map.values()) list.sort((a, b) => a.tcNum - b.tcNum);
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderDashboard({ run, history, groups, tests }) {
  const dataBlob = JSON.stringify({ run, history, groups, appName: APP_NAME });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(APP_NAME)} — Test Health Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --surface-1:      #fcfcfb;
    --page:           #f9f9f7;
    --text-primary:   #0b0b0b;
    --text-secondary: #52514e;
    --text-muted:     #898781;
    --gridline:       #e1e0d9;
    --baseline:       #c3c2b7;
    --border:         rgba(11,11,11,0.10);
    --card-shadow:    0 1px 2px rgba(11,11,11,0.06);
    --good:           #0ca30c;
    --warning:        #fab219;
    --serious:        #ec835a;
    --critical:       #d03b3b;
    --skip:           #898781;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --surface-1:      #1a1a19;
      --page:           #0d0d0d;
      --text-primary:   #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted:     #898781;
      --gridline:       #2c2c2a;
      --baseline:       #383835;
      --border:         rgba(255,255,255,0.10);
      --card-shadow:    0 1px 2px rgba(0,0,0,0.30);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--page);
    color: var(--text-primary);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 28px 20px 60px;
  }
  .wrap { width: min(1180px, 100%); margin: 0 auto; }
  header { margin-bottom: 22px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .subtitle { color: var(--text-secondary); font-size: 14px; margin: 0; }
  .updated { color: var(--text-muted); font-size: 12px; margin-top: 6px; }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    box-shadow: var(--card-shadow);
    border-radius: 14px;
  }

  .kpis {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
    margin: 20px 0;
  }
  .kpi { padding: 16px; min-width: 0; }
  .kpi-label {
    color: var(--text-muted); font-size: 11px; font-weight: 700;
    letter-spacing: .05em; text-transform: uppercase;
  }
  .kpi-value { font-size: 26px; font-weight: 650; margin-top: 6px; letter-spacing: -0.02em; }
  .kpi-delta { font-size: 12px; margin-top: 4px; font-weight: 600; }
  .kpi-delta.up { color: var(--good); }
  .kpi-delta.down { color: var(--critical); }
  .kpi-sparkline { margin-top: 8px; display: block; }
  .kpi.status-passed .kpi-value { color: var(--good); }
  .kpi.status-failed .kpi-value { color: var(--critical); }

  section.card { padding: 20px; margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 14px; }

  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; font-size: 12px; color: var(--text-secondary); }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto; }

  #chart-wrap { overflow-x: auto; }
  #chart { display: block; }
  .bar-seg { cursor: pointer; }
  .bar-hit { fill: transparent; }
  .axis-label { fill: var(--text-muted); font-size: 10px; }
  .gridline { stroke: var(--gridline); stroke-width: 1; }

  #tooltip {
    position: fixed; pointer-events: none; z-index: 20;
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 12px; font-size: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,.18);
    opacity: 0; transform: translateY(2px); transition: opacity .1s ease;
    min-width: 160px;
  }
  #tooltip.show { opacity: 1; }
  #tooltip .tt-date { color: var(--text-muted); font-size: 11px; margin-bottom: 6px; }
  #tooltip .tt-row { display: flex; justify-content: space-between; gap: 14px; padding: 2px 0; }
  #tooltip .tt-row .tt-key { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
  #tooltip .tt-row .tt-val { font-weight: 700; color: var(--text-primary); }
  #tooltip .tt-key-dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }

  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left; font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
    color: var(--text-muted); font-weight: 700; padding: 8px 10px; border-bottom: 1px solid var(--gridline);
  }
  tbody td { padding: 9px 10px; border-bottom: 1px solid var(--gridline); font-size: 13px; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  td.tc-id { color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.tc-duration { color: var(--text-muted); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .cat-row td { padding-top: 20px; font-weight: 750; color: var(--text-primary); border-bottom: 1px solid var(--baseline); }
  .cat-row td .cat-count { color: var(--text-muted); font-weight: 500; }

  .status-badge { display: inline-flex; align-items: center; gap: 6px; font-weight: 650; font-size: 12.5px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .status-badge.passed { color: var(--good); }
  .status-badge.passed .status-dot { background: var(--good); }
  .status-badge.failed { color: var(--critical); }
  .status-badge.failed .status-dot { background: var(--critical); }
  .status-badge.flaky { color: var(--warning); }
  .status-badge.flaky .status-dot { background: var(--warning); }
  .status-badge.skipped { color: var(--skip); }
  .status-badge.skipped .status-dot { background: var(--skip); }

  footer { color: var(--text-muted); font-size: 12px; text-align: center; margin-top: 24px; }

  @media (max-width: 860px) {
    .kpis { grid-template-columns: repeat(3, minmax(0,1fr)); }
  }
  @media (max-width: 480px) {
    .kpis { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${esc(APP_NAME)} — Test Health Dashboard</h1>
      <p class="subtitle">Automated Playwright coverage of the Comparinator text-comparison app.</p>
      <p class="updated" id="updated-line"></p>
    </header>

    <div class="kpis" id="kpi-row"></div>

    <section class="card">
      <div class="section-title">Run history</div>
      <div class="legend" id="chart-legend"></div>
      <div id="chart-wrap"><svg id="chart"></svg></div>
    </section>

    <section class="card">
      <div class="section-title">Test cases — latest run</div>
      <table id="test-table">
        <thead>
          <tr><th>ID</th><th>Test case</th><th>Status</th><th style="text-align:right">Duration</th></tr>
        </thead>
        <tbody id="test-table-body"></tbody>
      </table>
    </section>

    <footer>Regenerated automatically by <code>npm test</code> — this file is overwritten on every run, and run history accumulates in <code>reports/history.json</code>.</footer>
  </div>

  <div id="tooltip"></div>

  <script type="application/json" id="dashboard-data">${dataBlob}</script>
  <script>
  (() => {
    const DATA = JSON.parse(document.getElementById('dashboard-data').textContent);
    const { run, history, groups } = DATA;

    const STATUS_COLOR = {
      passed: 'var(--good)',
      flaky: 'var(--warning)',
      failed: 'var(--critical)',
      skipped: 'var(--skip)',
    };
    const STATUS_LABEL = { passed: 'Passed', flaky: 'Flaky', failed: 'Failed', skipped: 'Skipped' };
    const STACK_ORDER = ['passed', 'flaky', 'failed', 'skipped'];

    function fmtDate(iso) {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function fmtDuration(ms) {
      if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
      return Math.round(ms) + 'ms';
    }

    // ---------- Updated line ----------
    document.getElementById('updated-line').textContent =
      'Last run: ' + fmtDate(run.timestamp) + ' · ' + fmtDuration(run.durationMs) + ' · ' + history.length + ' run' + (history.length === 1 ? '' : 's') + ' recorded';

    // ---------- KPI row ----------
    const kpiRow = document.getElementById('kpi-row');
    const prevRun = history.length > 1 ? history[history.length - 2] : null;

    function makeKpi({ label, value, statusClass, deltaText, deltaDir, sparkline }) {
      const kpi = document.createElement('div');
      kpi.className = 'kpi card' + (statusClass ? ' status-' + statusClass : '');

      const lbl = document.createElement('div');
      lbl.className = 'kpi-label';
      lbl.textContent = label;
      kpi.appendChild(lbl);

      const val = document.createElement('div');
      val.className = 'kpi-value';
      val.textContent = value;
      kpi.appendChild(val);

      if (deltaText) {
        const delta = document.createElement('div');
        delta.className = 'kpi-delta ' + (deltaDir || '');
        delta.textContent = deltaText;
        kpi.appendChild(delta);
      }

      if (sparkline && sparkline.length >= 2) {
        kpi.appendChild(makeSparkline(sparkline));
      }

      return kpi;
    }

    function makeSparkline(points) {
      const w = 100, h = 24, pad = 2;
      const min = Math.min(...points), max = Math.max(...points);
      const range = max - min || 1;
      const stepX = (w - pad * 2) / (points.length - 1);
      const coords = points.map((p, i) => {
        const x = pad + i * stepX;
        const y = h - pad - ((p - min) / range) * (h - pad * 2);
        return [x, y];
      });
      const d = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'kpi-sparkline');
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('width', '100');
      svg.setAttribute('height', '24');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--text-muted)');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);

      const last = coords[coords.length - 1];
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', last[0]);
      dot.setAttribute('cy', last[1]);
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', 'var(--good)');
      svg.appendChild(dot);

      return svg;
    }

    const passRateHistory = history.map((r) => r.passRate);
    const passRateDelta = prevRun ? Number((run.passRate - prevRun.passRate).toFixed(1)) : null;

    kpiRow.appendChild(makeKpi({ label: 'Total tests', value: String(run.total) }));
    kpiRow.appendChild(makeKpi({ label: 'Passed', value: String(run.passed + run.flaky), statusClass: 'passed' }));
    kpiRow.appendChild(makeKpi({ label: 'Failed', value: String(run.failed), statusClass: run.failed > 0 ? 'failed' : undefined }));
    kpiRow.appendChild(makeKpi({
      label: 'Pass rate',
      value: run.passRate + '%',
      deltaText: passRateDelta === null ? null : (passRateDelta >= 0 ? '+' : '') + passRateDelta + ' pts vs last run',
      deltaDir: passRateDelta === null ? null : (passRateDelta >= 0 ? 'up' : 'down'),
      sparkline: passRateHistory,
    }));
    kpiRow.appendChild(makeKpi({ label: 'Last run duration', value: fmtDuration(run.durationMs) }));
    kpiRow.appendChild(makeKpi({ label: 'Runs recorded', value: String(history.length) }));

    // ---------- Legend ----------
    const legend = document.getElementById('chart-legend');
    STACK_ORDER.forEach((status) => {
      const hasAny = history.some((r) => (r[status] || 0) > 0);
      if (!hasAny) return;
      const item = document.createElement('span');
      item.className = 'legend-item';
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = STATUS_COLOR[status];
      item.appendChild(sw);
      const txt = document.createElement('span');
      txt.textContent = STATUS_LABEL[status];
      item.appendChild(txt);
      legend.appendChild(item);
    });

    // ---------- Stacked bar chart: run history ----------
    const svgNS = 'http://www.w3.org/2000/svg';
    const chart = document.getElementById('chart');
    const runs = history.slice(-20); // most recent 20 runs
    const barW = 22, gap = 18, plotH = 220, padTop = 16, padBottom = 34, padLeft = 34, padRight = 12;
    const plotW = runs.length * (barW + gap) - gap;
    const width = padLeft + plotW + padRight;
    const height = padTop + plotH + padBottom;
    chart.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    chart.setAttribute('width', String(Math.max(width, 320)));
    chart.setAttribute('height', String(height));

    const maxTotal = Math.max(...runs.map((r) => r.total), 1);
    function niceMax(n) {
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(n, 1))));
      const norm = n / mag;
      const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
      return step * mag;
    }
    const yMax = niceMax(maxTotal);
    const ticks = 4;

    // gridlines + y-axis labels
    for (let i = 0; i <= ticks; i++) {
      const value = Math.round((yMax / ticks) * i);
      const y = padTop + plotH - (value / yMax) * plotH;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('class', 'gridline');
      line.setAttribute('x1', padLeft);
      line.setAttribute('x2', padLeft + plotW);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      chart.appendChild(line);

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('class', 'axis-label');
      label.setAttribute('x', padLeft - 8);
      label.setAttribute('y', y + 3);
      label.setAttribute('text-anchor', 'end');
      label.textContent = String(value);
      chart.appendChild(label);
    }

    function roundedTopPath(x, y, w, h, r) {
      r = Math.min(r, w / 2, h);
      if (h <= 0) return '';
      return [
        'M', x, y + h,
        'L', x, y + r,
        'Q', x, y, x + r, y,
        'L', x + w - r, y,
        'Q', x + w, y, x + w, y + r,
        'L', x + w, y + h,
        'Z',
      ].join(' ');
    }

    const tooltip = document.getElementById('tooltip');

    runs.forEach((r, i) => {
      const x = padLeft + i * (barW + gap);
      let cursorY = padTop + plotH; // baseline, stacking upward
      const segGap = 2;
      const nonZero = STACK_ORDER.filter((s) => (r[s] || 0) > 0);

      nonZero.forEach((status, segIdx) => {
        const value = r[status] || 0;
        const segH = (value / yMax) * plotH;
        const isTop = segIdx === nonZero.length - 1;
        const drawH = Math.max(segH - (isTop ? 0 : segGap), 1);
        const drawY = cursorY - segH;

        let el;
        if (isTop) {
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', roundedTopPath(x, drawY, barW, drawH, 4));
          el = path;
        } else {
          const rect = document.createElementNS(svgNS, 'rect');
          rect.setAttribute('x', x);
          rect.setAttribute('y', drawY);
          rect.setAttribute('width', barW);
          rect.setAttribute('height', drawH);
          el = rect;
        }
        el.setAttribute('class', 'bar-seg');
        el.setAttribute('fill', STATUS_COLOR[status]);
        chart.appendChild(el);

        cursorY -= segH;
      });

      // Full-height transparent hit target for the whole bar (one tooltip, every series)
      const hit = document.createElementNS(svgNS, 'rect');
      hit.setAttribute('class', 'bar-hit');
      hit.setAttribute('x', x - gap / 2);
      hit.setAttribute('y', padTop);
      hit.setAttribute('width', barW + gap);
      hit.setAttribute('height', plotH);
      hit.setAttribute('tabindex', '0');
      hit.addEventListener('pointerenter', (e) => showTooltip(e, r));
      hit.addEventListener('pointermove', (e) => showTooltip(e, r));
      hit.addEventListener('focus', (e) => showTooltip(e, r));
      hit.addEventListener('pointerleave', hideTooltip);
      hit.addEventListener('blur', hideTooltip);
      chart.appendChild(hit);

      // x-axis label (short date), every run if few, thinned if many
      const showLabel = runs.length <= 10 || i % Math.ceil(runs.length / 10) === 0 || i === runs.length - 1;
      if (showLabel) {
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('class', 'axis-label');
        label.setAttribute('x', x + barW / 2);
        label.setAttribute('y', height - 12);
        label.setAttribute('text-anchor', 'middle');
        const d = new Date(r.timestamp);
        label.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        chart.appendChild(label);
      }
    });

    function showTooltip(evt, r) {
      tooltip.innerHTML = '';
      const dateEl = document.createElement('div');
      dateEl.className = 'tt-date';
      dateEl.textContent = fmtDate(r.timestamp) + ' · ' + fmtDuration(r.durationMs);
      tooltip.appendChild(dateEl);

      STACK_ORDER.forEach((status) => {
        const value = r[status] || 0;
        if (value === 0 && status !== 'passed' && status !== 'failed') return;
        const row = document.createElement('div');
        row.className = 'tt-row';
        const key = document.createElement('span');
        key.className = 'tt-key';
        const dot = document.createElement('span');
        dot.className = 'tt-key-dot';
        dot.style.background = STATUS_COLOR[status];
        key.appendChild(dot);
        const keyText = document.createElement('span');
        keyText.textContent = STATUS_LABEL[status];
        key.appendChild(keyText);
        row.appendChild(key);
        const val = document.createElement('span');
        val.className = 'tt-val';
        val.textContent = String(value);
        row.appendChild(val);
        tooltip.appendChild(row);
      });

      const rateRow = document.createElement('div');
      rateRow.className = 'tt-row';
      const rateKey = document.createElement('span');
      rateKey.className = 'tt-key';
      rateKey.textContent = 'Pass rate';
      rateRow.appendChild(rateKey);
      const rateVal = document.createElement('span');
      rateVal.className = 'tt-val';
      rateVal.textContent = r.passRate + '%';
      rateRow.appendChild(rateVal);
      tooltip.appendChild(rateRow);

      tooltip.classList.add('show');
      const ttRect = tooltip.getBoundingClientRect();
      let left = evt.clientX + 14;
      let top = evt.clientY - 10;
      if (left + ttRect.width > window.innerWidth - 8) left = evt.clientX - ttRect.width - 14;
      if (top + ttRect.height > window.innerHeight - 8) top = window.innerHeight - ttRect.height - 8;
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }
    function hideTooltip() {
      tooltip.classList.remove('show');
    }

    // ---------- Test case table ----------
    const tbody = document.getElementById('test-table-body');
    groups.forEach((group) => {
      const passCount = group.items.filter((t) => t.status === 'passed' || t.status === 'flaky').length;
      const catRow = document.createElement('tr');
      catRow.className = 'cat-row';
      const catCell = document.createElement('td');
      catCell.colSpan = 4;
      catCell.textContent = group.category + ' ';
      const count = document.createElement('span');
      count.className = 'cat-count';
      count.textContent = '(' + passCount + '/' + group.items.length + ' passed)';
      catCell.appendChild(count);
      catRow.appendChild(catCell);
      tbody.appendChild(catRow);

      group.items.forEach((t) => {
        const row = document.createElement('tr');

        const idCell = document.createElement('td');
        idCell.className = 'tc-id';
        idCell.textContent = t.tc || '—';
        row.appendChild(idCell);

        const titleCell = document.createElement('td');
        titleCell.textContent = t.title;
        row.appendChild(titleCell);

        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'status-badge ' + t.status;
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        badge.appendChild(dot);
        const label = document.createElement('span');
        label.textContent = STATUS_LABEL[t.status] || t.status;
        badge.appendChild(label);
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        const durCell = document.createElement('td');
        durCell.className = 'tc-duration';
        durCell.textContent = fmtDuration(t.durationMs);
        row.appendChild(durCell);

        tbody.appendChild(row);
      });
    });
  })();
  </script>
</body>
</html>
`;
}

function main() {
  const data = loadResults();
  const tests = collectSpecs(data.suites, []);
  const run = buildRun(data, tests);

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const history = loadHistory();
  history.push(run);
  const trimmed = history.length > MAX_HISTORY_RUNS ? history.slice(history.length - MAX_HISTORY_RUNS) : history;
  saveHistory(trimmed);

  const groups = groupByCategory(tests);
  const html = renderDashboard({ run, history: trimmed, groups, tests });
  fs.writeFileSync(DASHBOARD_PATH, html);

  console.log(`Dashboard updated: ${path.relative(ROOT, DASHBOARD_PATH)}`);
  console.log(
    `  ${run.passed + run.flaky} passed, ${run.failed} failed, ${run.skipped} skipped ` +
    `(${run.passRate}%) — ${trimmed.length} run${trimmed.length === 1 ? '' : 's'} recorded`
  );
}

main();

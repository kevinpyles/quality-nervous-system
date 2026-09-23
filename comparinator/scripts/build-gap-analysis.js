#!/usr/bin/env node
// Builds reports/gap-analysis.html (Quality Coverage Treemap) from the
// "## Gap analysis data" tables at the end of each agent report in reports/agents/.
// Summary fields come from reports/agents/gap-summary.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const agentsDir = path.join(root, 'reports', 'agents');

// Weight = relative risk/importance of the whole dimension (1-10). It sets the
// size of the top-level rectangle, independent of how many areas are listed.
const DIMENSIONS = [
  { name: 'Functional', weight: 10, owner: 'functional-agent', file: 'functional-report.md' },
  { name: 'Security', weight: 8, owner: 'security-agent', file: 'security-report.md' },
  { name: 'Accessibility', weight: 8, owner: 'a11y-agent', file: 'a11y-report.md' },
  { name: 'Internationalization', weight: 6, owner: 'i18n-agent', file: 'i18n-report.md' },
  { name: 'File loading (drag & drop)', weight: 6, owner: 'drag-n-drop-agent', file: 'drag-n-drop-report.md' },
  { name: 'Performance', weight: 5, owner: null, file: 'performance-gap-data.md' },
  { name: 'Branding & Style', weight: 4, owner: 'branding-style-agent', file: 'branding-style-report.md' },
];

const CONF = ['Strong', 'Partial', 'Weak', 'Gap', 'Unknown'];
const norm = (s) => s.replace(/\*\*|`/g, '').trim();
const pickConf = (s) => CONF.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(s)) || 'Unknown';
const pickIssue = (s) =>
  /blocker|critical/i.test(s) ? 'Blocker'
    : /significant/i.test(s) ? 'Significant risk'
      : /known/i.test(s) ? 'Known issue'
        : 'None';

function parseTable(md, file) {
  const i = md.search(/^##\s+Gap analysis data/im);
  if (i < 0) throw new Error(`${file}: no "## Gap analysis data" section`);
  const rows = md.slice(i).split('\n').filter((l) => /^\s*\|/.test(l));
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => norm(c.replace(/\\\|/g, '|')));
  const header = cells(rows[0]).map((h) => h.toLowerCase());
  const col = (re) => header.findIndex((h) => re.test(h));
  const ix = { area: col(/area/), risk: col(/risk/), conf: col(/confidence/), issue: col(/issue/), ev: col(/evidence/), notes: col(/notes/) };
  return rows.slice(2).map(cells).filter((c) => c[ix.area]).map((c) => ({
    name: c[ix.area],
    risk: Math.max(1, Math.min(10, parseInt(c[ix.risk], 10) || 5)),
    confidence: pickConf(c[ix.conf] || ''),
    issue: pickIssue(c[ix.issue] || ''),
    evidence: c[ix.ev] || '',
    notes: ix.notes >= 0 ? c[ix.notes] || '' : '',
  }));
}

const dimensions = [];
const missing = [];
for (const d of DIMENSIONS) {
  const f = path.join(agentsDir, d.file);
  if (!fs.existsSync(f)) {
    missing.push(d.file);
    dimensions.push({ ...d, source: `reports/agents/${d.file} (missing)`, areas: [{ name: `${d.name} (no report)`, risk: d.weight, confidence: 'Unknown', issue: 'None', evidence: 'No report found for this build.', notes: '' }] });
    continue;
  }
  const md = fs.readFileSync(f, 'utf8');
  dimensions.push({ name: d.name, weight: d.weight, owner: d.owner, source: `reports/agents/${d.file}`, areas: parseTable(md, d.file) });
}

const summary = JSON.parse(fs.readFileSync(path.join(agentsDir, 'gap-summary.json'), 'utf8'));

// Orchestrator overrides: normalise agent values to the gap-analysis rules
// (risk = product importance, not residual risk; evidence gaps are not known issues).
// The agent's original value is kept in the area's notes.
let overridden = 0;
for (const o of summary.overrides || []) {
  const dim = dimensions.find((d) => d.name === o.dimension);
  const area = dim && dim.areas.find((a) => a.name === o.area);
  if (!area) { console.warn(`Override target not found: ${o.dimension} / ${o.area}`); continue; }
  const was = [];
  if (o.risk != null && o.risk !== area.risk) { was.push(`risk ${area.risk}`); area.risk = o.risk; }
  if (o.issue && o.issue !== area.issue) { was.push(`issue "${area.issue}"`); area.issue = o.issue; }
  if (o.confidence && o.confidence !== area.confidence) { was.push(`confidence ${area.confidence}`); area.confidence = o.confidence; }
  if (was.length) {
    overridden++;
    area.notes = `${area.notes ? area.notes + ' ' : ''}[Orchestrator override: the agent reported ${was.join(', ')}. ${o.reason}]`;
  }
}
const html = fs.readFileSync(path.join(root, 'comparinator.html'));
const sha = crypto.createHash('sha256').update(html).digest('hex');
if (summary.buildSha && summary.buildSha !== sha) {
  console.warn(`WARNING: comparinator.html (${sha.slice(0, 12)}) differs from the build the agents assessed (${summary.buildSha.slice(0, 12)}). Evidence may be stale.`);
}

const data = {
  meta: [
    ['Build', `comparinator.html · sha256 ${sha.slice(0, 12)}`],
    ['Assessed', summary.date],
    ['Automated suite', summary.suite],
    ['Generated', new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
  ],
  recommendation: summary.recommendation,
  nextAction: summary.nextAction,
  footnotes: [
    ...(summary.footnotes || []),
    ...(overridden ? [`${overridden} agent values were normalised by the orchestrator. Each affected area names the original value in its notes.`] : []),
    ...(missing.length ? [`Missing reports (shown as Unknown): ${missing.join(', ')}`] : []),
  ],
  dimensions,
};

const tpl = fs.readFileSync(path.join(__dirname, 'gap-analysis-template.html'), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const out = path.join(root, 'reports', 'gap-analysis.html');
fs.writeFileSync(out, tpl.replace('/*__DATA__*/', () => json));
const n = dimensions.reduce((s, d) => s + d.areas.length, 0);
console.log(`Gap analysis written: ${path.relative(root, out)} (${dimensions.length} dimensions, ${n} areas)`);

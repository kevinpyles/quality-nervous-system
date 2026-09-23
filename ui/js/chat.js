/* ============================================================
   Claude chat pop-up — opened from an issue's AI agent badge on
   the map (a thread per finding) or from the header's Ask Claude
   button (a general thread). Non-modal: the map stays live behind
   it. Dismiss with ×/Esc; reopening resumes the same thread, and
   an answer that finishes while the pop-up is closed lights the
   header button's dot.

   Answers stream over the SSE bus (chat-* events from
   server/chat.mjs), so nothing is lost if the pop-up is closed
   mid-answer. Code changes arrive as ```diff proposals and are
   applied only when the user clicks Apply.
   ============================================================ */

import { api, onLiveEvent } from './api.js';
import { get, subscribe, toast } from './store.js';
import { agentIconSvg } from './agent-icon.js';

const ICONS = {
  threads: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};

const SUGGESTIONS = {
  issue: [
    ['Review this issue', 'Review this issue: what failed, the most likely root cause, and how confident you are. Point me at the exact code.'],
    ['Real bug or test problem?', 'Is this a real defect in the app, or a problem with the test or environment? Show the evidence either way.'],
    ['Propose a fix', 'Propose a fix for this issue as a diff I can review and apply.'],
  ],
  proof: [
    ['What was injected?', 'Explain what this controlled proof injected into the page and why it breaks the feature.'],
    ['How did QNS catch it?', 'Walk me through how the QNS agent detected this defect — which check failed and what evidence it captured.'],
    ['Is the real app healthy?', 'Is the real app (without the injected defect) healthy for this feature? What should I rerun to confirm?'],
  ],
  general: [
    ['Summarize the posture', 'Summarize the current release posture in a few bullets: what is blocking, what is a warning, and what I should do next.'],
    ['What should I look at first?', 'Of the open issues on the map, which one should I look at first and why?'],
    ['Explain the failing tests', 'Which tests are failing right now, and are they real bugs, known defects, or test problems?'],
  ],
};

let root, els = {};
let session = null;          // full session object for the open thread
let isOpen = false;
let invoker = null;           // element to return focus to on close
let showingThreads = false;
const dismissedProposals = new Set();
let renderQueued = new Set();

export function initChat() {
  root = document.getElementById('chat');
  root.innerHTML = `
    <header class="chat__head">
      <button type="button" class="chat__icon-btn chat__back" data-act="back" aria-label="Back to conversation" hidden>${ICONS.back}</button>
      <span class="chat__avatar">${agentIconSvg()}</span>
      <div class="chat__heading">
        <h2 class="chat__title" id="chat-title">Claude</h2>
        <p class="chat__subtitle" id="chat-subtitle">QNS assistant</p>
      </div>
      <button type="button" class="chat__icon-btn" data-act="threads" aria-label="All conversations" title="All conversations">${ICONS.threads}</button>
      <button type="button" class="chat__icon-btn" data-act="new" aria-label="New general conversation" title="New conversation">${ICONS.plus}</button>
      <button type="button" class="chat__icon-btn" data-act="close" aria-label="Close chat" title="Close (Esc)">${ICONS.close}</button>
    </header>
    <div class="chat__context" id="chat-context"></div>
    <div class="chat__log" id="chat-log" role="log" aria-live="off"></div>
    <div class="chat__threads" id="chat-threads" hidden></div>
    <form class="chat__composer" id="chat-form">
      <textarea id="chat-input" rows="1" placeholder="Ask Claude…" aria-label="Message Claude" aria-describedby="chat-hint"></textarea>
      <button type="submit" class="chat__send" id="chat-send" aria-label="Send">${ICONS.send}</button>
      <button type="button" class="chat__stop" id="chat-stop" hidden>Stop</button>
    </form>
    <p class="chat__hint" id="chat-hint">Enter to send · Shift+Enter for a new line · Claude reads code and runs tests; edits wait for your Apply.</p>
    <p class="sr-only" id="chat-status" role="status"></p>`;
  for (const id of ['chat-subtitle', 'chat-context', 'chat-log', 'chat-threads', 'chat-form', 'chat-input', 'chat-send', 'chat-stop', 'chat-status']) {
    els[id.replace('chat-', '')] = document.getElementById(id);
  }
  els.back = root.querySelector('[data-act="back"]');
  els.newBtn = root.querySelector('[data-act="new"]');

  document.getElementById('btn-ask-claude-icon').innerHTML = agentIconSvg();
  document.getElementById('btn-ask-claude').addEventListener('click', (e) => {
    if (isOpen && session?.kind === 'general') close();
    else openChat({ invoker: e.currentTarget });
  });
  window.addEventListener('qns-open-chat', (e) => openChat(e.detail || {}));

  root.addEventListener('click', onRootClick);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  els.form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  els.input.addEventListener('input', autosize);
  els.stop.addEventListener('click', () => session && api.chatStop(session.id).catch(() => {}));

  onLiveEvent(onEvent);
  subscribe(['appGraph'], () => { if (isOpen && session && !showingThreads) renderContext(); });
}

/* ---------- open / close ---------- */

export async function openChat({ componentId = null, invoker: inv = null, fresh = false } = {}) {
  invoker = inv || document.activeElement;
  try {
    session = await api.chatOpen({ componentId, fresh });
  } catch (err) {
    toast(`Could not open the chat: ${err.message}`, 'alert');
    return;
  }
  showingThreads = false;
  renderAll();
  if (!isOpen) {
    isOpen = true;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('is-open'));
  }
  setHeaderState();
  els.input.focus();
}

function close() {
  if (!isOpen) return;
  isOpen = false;
  root.classList.remove('is-open');
  const done = () => { if (!isOpen) root.hidden = true; };
  if (get('reducedMotion')) done(); else setTimeout(done, 220);
  setHeaderState();
  const back = invoker && document.contains(invoker) ? invoker : document.getElementById('btn-ask-claude');
  back?.focus();
}

function setHeaderState() {
  const btn = document.getElementById('btn-ask-claude');
  btn.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) document.getElementById('btn-ask-claude-dot').hidden = true;
}

function flagUnread(summary) {
  if (isOpen && session?.id === summary?.id) return;
  document.getElementById('btn-ask-claude-dot').hidden = false;
  toast(`Claude replied${summary?.title ? ' about ' + summary.title : ''} — open Ask Claude to read it`);
}

/* ---------- actions ---------- */

async function send(textOverride) {
  if (!session) return;
  const text = (textOverride ?? els.input.value).trim();
  if (!text || session.busy) return;
  els.input.value = '';
  autosize();
  try {
    session = await api.chatSend(session.id, text);
    renderAll();
  } catch (err) {
    toast(err.message, 'alert');
    if (!textOverride) els.input.value = text;
  }
}

async function onRootClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'close') return close();
  if (act === 'threads') return showThreads();
  if (act === 'back') { showingThreads = false; return renderAll(); }
  if (act === 'new') { await openChat({ fresh: true, invoker }); return; }
  if (act === 'open-thread') {
    session = await api.chatSession(btn.dataset.id);
    showingThreads = false;
    renderAll();
    els.input.focus();
    return;
  }
  if (act === 'suggest') return send(btn.dataset.prompt);
  if (act === 'apply') {
    btn.disabled = true;
    try { session = await api.chatApply(session.id, btn.dataset.id); renderAll(); }
    catch (err) { toast(err.message, 'alert'); btn.disabled = false; }
    return;
  }
  if (act === 'dismiss-proposal') { dismissedProposals.add(btn.dataset.id); return renderLog(); }
  if (act === 'undo') {
    try { session = await api.chatUndo(session.id); renderAll(); }
    catch (err) { toast(err.message, 'alert'); }
    return;
  }
  if (act === 'rerun') {
    btn.disabled = true;
    try { session = await api.chatRerun(session.id); renderAll(); }
    catch (err) { toast(err.message, 'alert'); btn.disabled = false; }
  }
}

/* ---------- live events ---------- */

function upsert(message) {
  const i = session.messages.findIndex((m) => m.id === message.id);
  if (i >= 0) session.messages[i] = { ...session.messages[i], ...message };
  else session.messages.push(message);
}

function onEvent(evt) {
  if (!evt.type?.startsWith('chat-')) return;
  const mine = session && evt.sessionId === session.id;
  if (evt.type === 'chat-done' && !mine) flagUnread(evt.session);
  if (!mine) return;
  if (evt.session) session.busy = evt.session.busy;

  switch (evt.type) {
    case 'chat-message':
      upsert(evt.message);
      renderLog();
      renderContext();
      break;
    case 'chat-delta': {
      const m = session.messages.find((x) => x.id === evt.messageId);
      if (m) { m.text += evt.text; queueMessageRender(m.id); }
      break;
    }
    case 'chat-tool': {
      const m = session.messages.find((x) => x.id === evt.messageId);
      if (m) { (m.tools ||= []).push(evt.tool); queueMessageRender(m.id); }
      break;
    }
    case 'chat-done':
      upsert(evt.message);
      renderLog();
      els.status.textContent = evt.message.status === 'error' ? 'Claude hit an error.' : 'Claude replied.';
      if (!isOpen) flagUnread(evt.session);
      break;
  }
  renderComposer();
}

/* ---------- rendering ---------- */

function renderAll() {
  root.classList.toggle('is-threads', showingThreads);
  els.back.hidden = !showingThreads;
  els.threads.hidden = !showingThreads;
  els.log.hidden = showingThreads;
  els.context.hidden = showingThreads;
  els.form.hidden = showingThreads;
  root.querySelector('.chat__hint').hidden = showingThreads;
  if (showingThreads) return;
  renderHeader();
  renderContext();
  renderLog();
  renderComposer();
}

function renderHeader() {
  const s = session;
  document.getElementById('chat-title').textContent = s.kind === 'issue' ? `Claude · ${s.title}` : 'Claude';
  els.subtitle.textContent = s.kind === 'issue'
    ? (s.proof ? `Controlled proof · ${s.proofName}` : s.severity ? `${cap(s.severity)} · ${s.runId}` : 'No open issue')
    : 'QNS assistant · runs, issues and code';
  root.dataset.severity = s.kind === 'issue' ? (s.severity || 'none') : 'none';
}

function currentIssue() {
  const comp = (get('appGraph')?.components || []).find((c) => c.id === session.componentId);
  return comp?.issue || null;
}

function renderContext() {
  const s = session;
  if (s.kind !== 'issue' || !s.findingId) { els.context.hidden = true; els.context.innerHTML = ''; return; }
  const live = currentIssue();
  const resolved = !live || live.findingId !== s.findingId;
  const title = (live && !resolved ? live.title : s.issueTitle) || 'Issue';
  els.context.hidden = false;
  els.context.dataset.state = resolved ? 'resolved' : s.severity;
  // once the conversation is going, the card shrinks to leave room for it
  els.context.classList.toggle('is-compact', s.messages.length > 0);
  els.context.innerHTML = `
    <div class="chat__context-row">
      <span class="chat__pill chat__pill--${resolved ? 'resolved' : esc(s.severity)}">${resolved ? 'Resolved' : esc(s.severity)}</span>
      ${s.proof ? '<span class="chat__pill chat__pill--proof">Controlled proof</span>' : ''}
      <span class="chat__context-run">${esc(s.runId || '')}</span>
      ${s.runId && !resolved ? `<button type="button" class="chat__link-btn" data-act="rerun">Rerun failed checks</button>` : ''}
    </div>
    <p class="chat__context-title">${esc(title)}</p>
    ${resolved ? '<p class="chat__context-note">This issue is no longer open on the map. The conversation is kept for reference.</p>'
      : s.proof ? '<p class="chat__context-note">QNS injected this defect on purpose to prove it can catch it — the app source is not broken.</p>' : ''}`;
}

function renderComposer() {
  const busy = !!session?.busy;
  els.send.hidden = busy;
  els.stop.hidden = !busy;
  els.input.placeholder = busy ? 'Claude is working…' : session?.kind === 'issue' ? `Ask about ${session.title}…` : 'Ask Claude…';
  root.classList.toggle('is-busy', busy);
}

function renderLog() {
  const atBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 60;
  const s = session;
  if (!s.messages.length) {
    const kind = s.kind === 'issue' ? (s.proof ? 'proof' : 'issue') : 'general';
    els.log.innerHTML = `
      <div class="chat__empty">
        <span class="chat__empty-mark">${agentIconSvg()}</span>
        <p class="chat__empty-title">${s.kind === 'issue' ? `How can I help with ${esc(s.title)}?` : 'How can I help?'}</p>
        <p class="chat__empty-sub">${s.kind === 'issue'
          ? 'I have the finding, its evidence and the app code. Pick a starting point or ask anything.'
          : 'I can see the latest runs, the open issues on the map and the app code.'}</p>
        <div class="chat__suggestions">
          ${SUGGESTIONS[kind].map(([label, prompt]) =>
            `<button type="button" class="chat__suggestion" data-act="suggest" data-prompt="${esc(prompt)}">${esc(label)}</button>`).join('')}
        </div>
      </div>`;
    return;
  }
  els.log.innerHTML = s.messages.map(messageHtml).join('');
  if (atBottom || s.busy) els.log.scrollTop = els.log.scrollHeight;
}

function queueMessageRender(id) {
  renderQueued.add(id);
  if (renderQueued.size > 1) return;
  requestAnimationFrame(() => {
    const atBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 80;
    for (const mid of renderQueued) {
      const m = session?.messages.find((x) => x.id === mid);
      const el = m && els.log.querySelector(`[data-mid="${mid}"]`);
      if (el) el.outerHTML = messageHtml(m);
      else if (m) renderLog();
    }
    renderQueued = new Set();
    if (atBottom) els.log.scrollTop = els.log.scrollHeight;
  });
}

function messageHtml(m) {
  if (m.role === 'user') {
    return `<div class="msg msg--user" data-mid="${m.id}"><div class="msg__bubble">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`;
  }
  if (m.role === 'system') {
    return `<div class="msg msg--system" data-mid="${m.id}"${m.verdict ? ` data-verdict="${m.verdict === 'passed' ? 'pass' : 'fail'}"` : ''}>${esc(m.text)}</div>`;
  }
  const streaming = m.status === 'streaming';
  const tools = m.tools || [];
  const toolHtml = !tools.length ? '' : streaming
    ? `<ul class="msg__tools">${tools.slice(-3).map((t, i, arr) =>
        `<li class="${i === arr.length - 1 ? 'is-live' : ''}">${esc(t.label)}</li>`).join('')}</ul>`
    : `<details class="msg__tools-done"><summary>Used ${tools.length} tool${tools.length === 1 ? '' : 's'}</summary>
         <ul class="msg__tools">${tools.map((t) => `<li>${esc(t.label)}</li>`).join('')}</ul></details>`;
  const body = m.text ? md(m.text) : streaming ? '<p class="msg__thinking">Thinking<span>.</span><span>.</span><span>.</span></p>' : '';
  let footer = '';
  if (m.status === 'error') footer = '<p class="msg__note msg__note--error">Claude Code could not finish this answer.</p>';
  if (m.status === 'stopped') footer = '<p class="msg__note">Stopped.</p>';
  if (m.status === 'interrupted') footer = '<p class="msg__note">Interrupted when QNS restarted.</p>';
  if (m.proposal && !streaming) {
    if (m.applied) {
      footer += `<div class="msg__actions"><span class="chat__pill chat__pill--resolved">Applied</span>
        <button type="button" class="chat__link-btn" data-act="undo">Undo change</button></div>`;
    } else if (!dismissedProposals.has(m.id)) {
      footer += `<div class="msg__actions">
        <button type="button" class="qns-btn qns-btn--ai chat__apply" data-act="apply" data-id="${m.id}" ${session.busy ? 'disabled' : ''}>Apply change</button>
        <button type="button" class="chat__link-btn" data-act="dismiss-proposal" data-id="${m.id}">Not now</button>
        <span class="msg__actions-note">Backs up the file, then reruns the failed checks.</span></div>`;
    }
  }
  return `<div class="msg msg--ai${streaming ? ' is-streaming' : ''}" data-mid="${m.id}">
    <span class="msg__avatar">${agentIconSvg()}</span>
    <div class="msg__content">${toolHtml}<div class="msg__md">${body}</div>${footer}</div>
  </div>`;
}

async function showThreads() {
  showingThreads = true;
  renderAll();
  document.getElementById('chat-title').textContent = 'Conversations';
  els.subtitle.textContent = 'Issue threads and general chats';
  root.dataset.severity = 'none';
  let list = [];
  try { list = await api.chatSessions(); } catch { /* shown as empty */ }
  els.threads.innerHTML = list.length ? `<ul class="chat__thread-list">${list.map((t) => `
    <li><button type="button" class="chat__thread${session?.id === t.id ? ' is-current' : ''}" data-act="open-thread" data-id="${t.id}">
      <span class="chat__thread-dot" data-severity="${t.kind === 'issue' ? esc(t.severity || 'none') : 'general'}"></span>
      <span class="chat__thread-main">
        <span class="chat__thread-title">${esc(t.kind === 'issue' ? t.title : 'General')}${t.proof ? ' <span class="chat__pill chat__pill--proof">proof</span>' : ''}</span>
        <span class="chat__thread-last">${esc(t.lastText || 'No messages yet')}</span>
      </span>
      <span class="chat__thread-time">${t.busy ? 'working…' : ago(t.updatedAt)}</span>
    </button></li>`).join('')}</ul>`
    : '<p class="chat__empty-sub">No conversations yet.</p>';
  els.threads.querySelector('button')?.focus();
}

/* ---------- helpers ---------- */

function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 140) + 'px';
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Small, safe markdown: everything is escaped first, then a fixed set
   of constructs is re-marked. No raw HTML or links ever pass through. */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, '$1<em>$2</em>');
}

function codeBlock(lines, lang) {
  if (lang === 'diff') {
    const cls = (l) => l.startsWith('+++') || l.startsWith('---') ? 'd-meta'
      : l.startsWith('@@') ? 'd-hunk' : l.startsWith('+') ? 'd-add' : l.startsWith('-') ? 'd-del' : '';
    return `<pre class="md-code md-diff"><code>${lines.map((l) => `<span class="${cls(l)}">${esc(l) || ' '}</span>`).join('\n')}</code></pre>`;
  }
  return `<pre class="md-code"><code>${esc(lines.join('\n'))}</code></pre>`;
}

function md(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  const isBlockStart = (l) => /^```|^#{1,4}\s|^\s*[-*]\s+|^\s*\d+[.)]\s+|^\s*\|/.test(l);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(codeBlock(buf, fence[1]));
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) { out.push(`<p class="md-h">${inline(h[1])}</p>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      const [head, ...rest] = body;
      out.push(`<div class="md-table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>
        <tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

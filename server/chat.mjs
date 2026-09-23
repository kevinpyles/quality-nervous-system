/* ============================================================
   Claude chat — the cockpit's AI agent, backed by Claude Code
   running headless (`claude -p`) with the user's own login.

   Governance (Requirements.md: governed agent fix requests):
     · chat turns are READ-ONLY: Claude can read code, evidence and
       test results and run Playwright, but Edit/Write are denied by
       the CLI itself — not by asking nicely in a prompt
     · a code change is only ever a proposal (a ```diff block) until
       the human clicks Apply; only that turn gets the Edit tool
     · every Apply backs up the touched files first (Undo restores
       them) and then reruns the failed checks as a real QNS run

   Streaming rides the existing SSE bus (chat-* events), so a pop-up
   that was closed mid-answer picks the stream back up on reopen.
   ============================================================ */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_UNDER_TEST, AGENTS, COMPONENTS } from './catalog.mjs';
import { state, DATA_DIR, EVIDENCE_DIR } from './store.mjs';
import { requestRun, onEvent, emit } from './engine.mjs';
import { openIssueFor as openIssueForState, openIssues as openIssuesInState } from './issues.mjs';

const QNS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAT_FILE = path.join(DATA_DIR, 'chats.json');
const BACKUP_DIR = path.join(DATA_DIR, 'chat-backups');
const CLAUDE_BIN = process.env.QNS_CLAUDE_BIN || 'claude';
const TURN_TIMEOUT_MS = 10 * 60_000;

const READ_ONLY_TOOLS = [
  'Read', 'Grep', 'Glob',
  'Bash(npx playwright test:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)',
  'Bash(wc:*)', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(git log:*)',
];
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

const SYSTEM_PROMPT = `You are Claude, the AI agent built into the QNS (Quality Nervous System) cockpit. \
The person chatting with you is the quality engineer running QNS; they reach you from a small chat pop-up, \
either from an issue on the living map or from the header.

Style: concise and skimmable. Short paragraphs, bullets where they help, no headings bigger than ###. \
Lead with the answer. Reference code as path:line.

Your working directory is the app under test (${APP_UNDER_TEST.name}, main file ${APP_UNDER_TEST.entry || 'index.html'}). \
QNS's own code, run evidence and agent definitions are in ${QNS_ROOT} (server/agents.mjs holds the sensor agents and \
the sabotage injectors used by controlled proofs; data/evidence/<runId>/ holds screenshots and logs).

You can read files and run the app's Playwright suite (npx playwright test). You CANNOT edit files in this chat — \
the edit tools are disabled until the user approves a change. When a fix is warranted, PROPOSE it:
  1. one or two sentences on what the change does and why,
  2. exactly one fenced \`\`\`diff block containing a unified diff (paths relative to your working directory,
     with --- a/<path> and +++ b/<path> headers and enough context lines to apply unambiguously),
  3. end with: "Click **Apply** to make this change — QNS will back up the file and rerun the failed checks."
Never say you changed a file unless you were told the user clicked Apply.

Controlled proofs: when the context says the issue came from a controlled proof, the defect was injected at runtime by \
QNS on purpose and the app's source is not broken. Explain what was injected and how QNS caught it, and suggest a live \
rerun to confirm the real app is healthy. Do not propose app code changes for a proof defect.`;

/* ---------- persistence ---------- */
export const chats = { sessions: [] };
let writing = Promise.resolve();
function persistChats() {
  writing = writing.then(async () => {
    const tmp = CHAT_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(chats, null, 2));
    await rename(tmp, CHAT_FILE);
  }).catch((err) => console.error('[chat] persist failed:', err.message));
  return writing;
}

export async function initChat() {
  if (existsSync(CHAT_FILE)) {
    try { Object.assign(chats, JSON.parse(await readFile(CHAT_FILE, 'utf8'))); }
    catch (err) { console.error('[chat] chats.json unreadable, starting fresh:', err.message); }
  }
  // a process restart kills any in-flight turn
  for (const s of chats.sessions) {
    if (s.busy) {
      s.busy = false;
      const m = s.messages.at(-1);
      if (m?.role === 'assistant' && m.status === 'streaming') { m.status = 'interrupted'; }
    }
  }
  chats.sessions = chats.sessions.slice(0, 100);
  await persistChats();

  // close the loop on Apply → rerun: report the verdict in the thread
  onEvent((evt) => {
    if (evt.type !== 'run-finished') return;
    for (const s of chats.sessions) {
      if (s.pendingRerun !== evt.runId) continue;
      s.pendingRerun = null;
      const run = state.runs.find((r) => r.id === evt.runId);
      const c = run?.decision?.counts;
      const verdict = (run?.findings || []).length === 0 ? 'passed' : 'still failing';
      addSystemMessage(s, `Rerun ${evt.runId} finished — ${verdict}. Posture ${run?.decision?.posture || 'unknown'}`
        + (c ? ` · ${c.pass} pass, ${c.fail} fail, ${c.degraded} degraded.` : '.'), { runId: evt.runId, verdict });
    }
  });
}

/* ---------- the issue behind a map node (see issues.mjs) ---------- */

export const openIssueFor = (componentId) => openIssueForState(state, componentId);
const openIssues = () => openIssuesInState(state);

/* ---------- sessions ---------- */

function summarize(s) {
  const last = s.messages.at(-1);
  return {
    id: s.id, kind: s.kind, title: s.title, componentId: s.componentId, findingId: s.findingId,
    runId: s.runId, severity: s.severity, proof: s.proof, proofName: s.proofName,
    busy: s.busy, updatedAt: s.updatedAt, messageCount: s.messages.length,
    lastText: last ? last.text.slice(0, 140) : '',
  };
}

export function listSessions() { return chats.sessions.map(summarize); }
export function getSession(id) { return chats.sessions.find((s) => s.id === id) || null; }

function touch(s) { s.updatedAt = new Date().toISOString(); }

/* Opening from a node reuses that finding's thread, so dismissing and
   reopening the pop-up picks the conversation back up. The header
   button reuses the most recent general thread. */
export async function openSession({ componentId = null } = {}) {
  if (componentId) {
    const issue = openIssueFor(componentId);
    const comp = COMPONENTS.find((c) => c.id === componentId);
    const existing = chats.sessions.find((s) => s.kind === 'issue' && s.componentId === componentId
      && (!issue || s.findingId === issue.findingId));
    if (existing) return existing;
    return createSession({
      kind: 'issue',
      title: comp?.label || componentId,
      componentId,
      findingId: issue?.findingId || null,
      runId: issue?.runId || null,
      severity: issue?.severity || null,
      issueTitle: issue?.title || null,
      proof: issue?.proof || null,
      proofName: issue?.proofName || null,
    });
  }
  const general = chats.sessions.find((s) => s.kind === 'general');
  return general || createSession({ kind: 'general', title: 'QNS assistant' });
}

export async function newGeneralSession() {
  return createSession({ kind: 'general', title: 'QNS assistant' });
}

async function createSession(fields) {
  const now = new Date().toISOString();
  const s = {
    id: 'chat-' + randomUUID().slice(0, 8),
    claudeSessionId: randomUUID(),
    started: false,
    busy: false,
    pendingRerun: null,
    backups: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
  chats.sessions.unshift(s);
  await persistChats();
  return s;
}

function addSystemMessage(s, text, extra = {}) {
  const m = { id: 'm-' + randomUUID().slice(0, 8), role: 'system', text, at: new Date().toISOString(), ...extra };
  s.messages.push(m);
  touch(s);
  persistChats();
  emit('chat-message', { sessionId: s.id, message: m, session: summarize(s) });
  return m;
}

/* ---------- context brief (first turn only) ---------- */

async function evidenceFiles(runId) {
  try { return (await readdir(path.join(EVIDENCE_DIR, runId))).slice(0, 12); } catch { return []; }
}

async function contextBrief(s) {
  const lines = ['[QNS context — attached automatically by the cockpit]'];
  lines.push(`App under test: ${APP_UNDER_TEST.name} at ${APP_UNDER_TEST.path} (served at ${APP_UNDER_TEST.url}).`);

  if (s.kind === 'issue') {
    const run = state.runs.find((r) => r.id === s.runId);
    const finding = run?.findings?.find((f) => f.id === s.findingId);
    const signal = run?.signals?.find((sig) => sig.component === s.componentId);
    const agent = AGENTS.find((a) => a.id === (finding?.agentId || signal?.agentId));
    lines.push(`Component: ${s.title} (${s.componentId}).`);
    if (!run || !finding) {
      lines.push('There is no open finding for this component right now; the user wants to talk about it generally.');
    } else {
      lines.push(`Severity: ${finding.severity}. Agent: ${agent?.name || finding.agentId} (${finding.agentId}).`);
      lines.push(`Run: ${run.id} · cadence ${run.cadence} · finished ${run.finishedAt} · build ${run.build?.label || '?'}.`);
      lines.push(run.proof
        ? `CONTROLLED PROOF: "${run.proofName}" (${run.proof}). This defect was injected on purpose by QNS; the app source is not broken.`
        : 'Context: live run against the real app.');
      lines.push(`Finding: ${finding.title}`);
      lines.push(`Impact: ${finding.impact}`);
      lines.push(`Recommended action: ${finding.recommendedAction}`);
      if (finding.historyNote) lines.push(`History: ${finding.historyNote}`);
      if (signal?.details?.length) lines.push('Agent details:\n' + signal.details.slice(0, 12).map((d) => `  - ${d}`).join('\n'));
      const files = await evidenceFiles(run.id);
      if (files.length) lines.push(`Evidence folder: ${path.join(EVIDENCE_DIR, run.id)} (${files.join(', ')}).`);
      if (finding.agentId === 'external-playwright-suite') {
        lines.push(`The suite's latest JSON results: ${path.join(APP_UNDER_TEST.path, 'test-results', 'results.json')}.`);
      }
    }
  } else {
    const latest = state.runs.find((r) => r.status === 'completed');
    if (latest) {
      lines.push(`Latest completed run: ${latest.id} (${latest.cadence}${latest.proof ? `, controlled proof "${latest.proofName}"` : ''}) → ${latest.decision?.posture} — ${latest.decision?.reason}`);
    }
    const issues = openIssues();
    lines.push(issues.length
      ? 'Open issues on the map:\n' + issues.map((i) => `  - ${i.componentId}: ${i.severity}${i.proof ? ' (controlled proof)' : ''} — ${i.title}`).join('\n')
      : 'No open issues on the map right now.');
  }
  lines.push('[end of QNS context]');
  return lines.join('\n');
}

/* ---------- running a Claude Code turn ---------- */

const running = new Map(); // sessionId -> child process

function describeTool(name, input = {}) {
  const rel = (p) => (p ? path.relative(APP_UNDER_TEST.path, p) || p : '');
  switch (name) {
    case 'Read': return `Reading ${rel(input.file_path)}`;
    case 'Grep': return `Searching for “${String(input.pattern || '').slice(0, 40)}”`;
    case 'Glob': return `Listing ${input.pattern || 'files'}`;
    case 'Bash': return `Running ${String(input.command || '').slice(0, 60)}`;
    case 'Edit': case 'Write': return `Editing ${rel(input.file_path)}`;
    default: return `Using ${name}`;
  }
}

function runTurn(s, prompt, { allowEdits = false } = {}) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--append-system-prompt', SYSTEM_PROMPT, '--add-dir', QNS_ROOT];
  args.push(...(s.started ? ['--resume', s.claudeSessionId] : ['--session-id', s.claudeSessionId]));
  if (allowEdits) {
    args.push('--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Edit', '--disallowedTools', 'Bash', 'Write', 'NotebookEdit');
  } else {
    args.push('--allowedTools', ...READ_ONLY_TOOLS, '--disallowedTools', ...WRITE_TOOLS);
  }

  const msg = { id: 'm-' + randomUUID().slice(0, 8), role: 'assistant', text: '', tools: [], status: 'streaming', at: new Date().toISOString() };
  s.messages.push(msg);
  s.busy = true;
  touch(s);
  emit('chat-message', { sessionId: s.id, message: msg, session: summarize(s) });

  return new Promise((resolve) => {
    const proc = spawn(CLAUDE_BIN, args, { cwd: APP_UNDER_TEST.path, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    running.set(s.id, proc);
    let buf = '', stderr = '', sawTextInBlock = false;
    const timer = setTimeout(() => proc.kill('SIGTERM'), TURN_TIMEOUT_MS);

    const pushText = (t) => {
      msg.text += t;
      emit('chat-delta', { sessionId: s.id, messageId: msg.id, text: t });
    };

    proc.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'stream_event') {
          const ev = e.event || {};
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'text') {
            // separate the prose of successive assistant messages (text → tool → text)
            if (msg.text && !msg.text.endsWith('\n\n')) pushText('\n\n');
            sawTextInBlock = true;
          }
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') pushText(ev.delta.text);
        } else if (e.type === 'assistant') {
          for (const block of (e.message?.content || [])) {
            if (block.type !== 'tool_use') continue;
            const t = { name: block.name, label: describeTool(block.name, block.input) };
            msg.tools.push(t);
            emit('chat-tool', { sessionId: s.id, messageId: msg.id, tool: t });
          }
        } else if (e.type === 'result') {
          if (e.is_error && !msg.text) pushText(e.result || 'Claude Code reported an error.');
          if (!sawTextInBlock && !msg.text && e.result) pushText(e.result);
          msg.costUsd = e.total_cost_usd ?? null;
        }
      }
    });
    proc.stderr.on('data', (d) => { stderr += d; });

    const finish = (status, errText) => {
      clearTimeout(timer);
      running.delete(s.id);
      if (errText && !msg.text) msg.text = errText;
      msg.status = status;
      msg.proposal = /```diff\n[\s\S]*?```/.test(msg.text) && !allowEdits;
      s.started = true;
      s.busy = false;
      touch(s);
      persistChats();
      emit('chat-done', { sessionId: s.id, message: msg, session: summarize(s) });
      resolve(msg);
    };
    proc.on('error', (err) => finish('error', err.code === 'ENOENT'
      ? 'Claude Code (`claude`) was not found on this machine. Install it or set QNS_CLAUDE_BIN, then try again.'
      : `Could not start Claude Code: ${err.message}`));
    proc.on('close', (code, signal) => {
      if (signal === 'SIGTERM' && msg.status === 'streaming') return finish('stopped');
      if (code !== 0 && !msg.text) {
        const hint = /log ?in|auth|credential/i.test(stderr) ? ' Run `claude` in a terminal once to sign in.' : '';
        return finish('error', `Claude Code exited with code ${code}.${hint}\n\n${stderr.trim().slice(-600)}`);
      }
      finish('done');
    });
  });
}

/* ---------- public actions ---------- */

export async function sendMessage(s, text) {
  if (s.busy) throw new Error('Claude is still answering the previous message.');
  const clean = String(text || '').trim().slice(0, 8000);
  if (!clean) throw new Error('Message is empty.');
  const userMsg = { id: 'm-' + randomUUID().slice(0, 8), role: 'user', text: clean, at: new Date().toISOString() };
  s.messages.push(userMsg);
  touch(s);
  emit('chat-message', { sessionId: s.id, message: userMsg, session: summarize(s) });
  const prompt = s.started ? clean : `${await contextBrief(s)}\n\n${clean}`;
  runTurn(s, prompt); // streams over SSE; callers don't wait on the answer
  return userMsg;
}

export function stopTurn(s) {
  const proc = running.get(s.id);
  if (proc) proc.kill('SIGTERM');
  return !!proc;
}

/* paths named by the proposal's diff headers, kept inside the app folder */
function diffPaths(text) {
  const block = (text.match(/```diff\n([\s\S]*?)```/) || [])[1] || '';
  const paths = new Set();
  for (const m of block.matchAll(/^\+\+\+ (?:b\/)?(\S+)/gm)) {
    if (m[1] === '/dev/null') continue;
    const abs = path.resolve(APP_UNDER_TEST.path, m[1]);
    if (abs.startsWith(APP_UNDER_TEST.path + path.sep)) paths.add(abs);
  }
  if (!paths.size) paths.add(path.join(APP_UNDER_TEST.path, APP_UNDER_TEST.entry || 'index.html'));
  return [...paths];
}

/* synchronous guard, so the route can reject before answering 202 */
export function checkApply(s, messageId) {
  if (s.busy) throw new Error('Claude is busy — wait for the current answer to finish.');
  const proposal = s.messages.find((m) => m.id === messageId);
  if (!proposal?.proposal) throw new Error('That message has no proposed change.');
  if (proposal.applied) throw new Error('That change was already applied.');
  return proposal;
}

export async function applyProposal(s, messageId) {
  const proposal = checkApply(s, messageId);
  s.busy = true; // hold the thread while backing up, before the edit turn starts

  // back up every file the diff touches, so Undo can restore it exactly
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_DIR, s.id, stamp);
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const abs of diffPaths(proposal.text)) {
    if (!existsSync(abs)) continue;
    const rel = path.relative(APP_UNDER_TEST.path, abs);
    const dest = path.join(dir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(abs, dest);
    files.push(rel);
  }
  s.backups.push({ dir, files, messageId, at: new Date().toISOString(), restored: false });
  proposal.applied = true;
  s.busy = false;
  addSystemMessage(s, `Approved — applying the change. Backed up ${files.join(', ') || 'nothing (new files only)'} first.`);

  const result = await runTurn(s,
    'The user clicked Apply on your most recent proposed change. Apply exactly that change now with the Edit tool — '
    + 'nothing more. Then reply with one short sentence naming the file(s) you changed.',
    { allowEdits: true });

  if (result.status !== 'done') {
    addSystemMessage(s, 'The change may not have been applied completely. Use Undo to restore the backup if needed.');
    return;
  }
  if (s.runId) {
    const src = state.runs.find((r) => r.id === s.runId);
    try {
      const rerun = await requestRun({ scope: { type: 'rerun-failed', value: s.runId }, cadence: src?.cadence || 'ad-hoc', trigger: 'ai-requested' });
      s.pendingRerun = rerun.id;
      addSystemMessage(s, `Rerunning the failed checks as ${rerun.id}…`, { runId: rerun.id });
    } catch (err) {
      addSystemMessage(s, `Could not start the verification rerun: ${err.message}`);
    }
  }
}

export async function undoLastApply(s) {
  const b = [...s.backups].reverse().find((x) => !x.restored);
  if (!b) throw new Error('Nothing to undo.');
  for (const rel of b.files) {
    await copyFile(path.join(b.dir, rel), path.join(APP_UNDER_TEST.path, rel));
  }
  b.restored = true;
  const m = s.messages.find((x) => x.id === b.messageId);
  if (m) m.applied = false;
  addSystemMessage(s, `Undone — restored ${b.files.join(', ')} from the backup taken before the change.`);
}

export async function rerunIssue(s) {
  if (!s.runId) throw new Error('This conversation is not tied to a run.');
  const src = state.runs.find((r) => r.id === s.runId);
  const rerun = await requestRun({ scope: { type: 'rerun-failed', value: s.runId }, cadence: src?.cadence || 'ad-hoc', trigger: 'manual-ui' });
  s.pendingRerun = rerun.id;
  addSystemMessage(s, `Live rerun of the failed checks started as ${rerun.id}…`, { runId: rerun.id });
  return rerun;
}

import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { extractReminderWithProvider, buildSkillEvidence, mcpTools } from './lib/agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const dataDir = path.join(__dirname, 'data');
const statePath = path.join(dataDir, 'state.json');
const publicDir = path.join(__dirname, 'public');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function getState() {
  if (!existsSync(statePath)) {
    await mkdir(dataDir, { recursive: true });
    const seed = await readJson(path.join(dataDir, 'seed.json'));
    await writeFile(statePath, JSON.stringify(seed, null, 2));
  }
  return readJson(statePath);
}

async function saveState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

function send(res, status, payload, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(payload) : payload);
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function activity(state, kind, title, detail) {
  state.activity.unshift({ id: randomUUID(), kind, title, detail, time: 'Just now' });
  state.activity = state.activity.slice(0, 8);
}

function audit(state, action, entityType, entityId, metadata = {}) {
  state.audit.unshift({ id: randomUUID(), actor: 'local-user', action, entityType, entityId, metadata, createdAt: new Date().toISOString() });
  state.audit = state.audit.slice(0, 20);
}

function jsonRoute(pathname, method) {
  return pathname.startsWith('/api/') && (method === 'GET' || method === 'POST' || method === 'PATCH');
}

async function handleApi(req, res, pathname) {
  const state = await getState();
  if (pathname === '/api/state' && req.method === 'GET') return send(res, 200, state);
  if (pathname === '/api/mcp/tools' && req.method === 'GET') return send(res, 200, { tools: mcpTools, localOnly: true });
  if (pathname === '/api/connect' && req.method === 'POST') {
    state.connection.connected = true;
    state.connection.lastSync = new Date().toISOString();
    activity(state, 'connection', 'Gmail connected', 'Read-only demo connector is ready to sync');
    audit(state, 'connect', 'connection', 'gmail');
    await saveState(state);
    return send(res, 200, { connection: state.connection });
  }
  if (pathname === '/api/sync' && req.method === 'POST') {
    state.connection.connected = true;
    state.connection.lastSync = new Date().toISOString();
    state.threads.forEach((thread) => { thread.syncedAt = state.connection.lastSync; });
    activity(state, 'sync', 'Inbox synced', `${state.threads.length} threads are ready for review`);
    audit(state, 'sync', 'connection', 'gmail', { imported: state.threads.length });
    await saveState(state);
    return send(res, 200, { count: state.threads.length, connection: state.connection });
  }
  if (pathname === '/api/extract-reminder' && req.method === 'POST') {
    const input = await body(req);
    const thread = state.threads.find((item) => item.id === input.threadId);
    if (!thread) return send(res, 404, { error: 'Thread not found' });
    const proposal = await extractReminderWithProvider(thread);
    audit(state, 'extract', 'thread', thread.id, { confidence: proposal.confidence });
    await saveState(state);
    return send(res, 200, { proposal, mode: proposal.provider || 'local-pipeline' });
  }
  if (pathname === '/api/reminders' && req.method === 'POST') {
    const input = await body(req);
    if (!input.title || !input.sourceThreadId) return send(res, 400, { error: 'A title and source thread are required.' });
    const reminder = { ...input, id: randomUUID(), status: 'upcoming', createdBy: 'TraceForm agent', createdAt: new Date().toISOString() };
    state.reminders.unshift(reminder);
    activity(state, 'reminder', 'Reminder approved', reminder.title);
    audit(state, 'approve', 'reminder', reminder.id, { sourceThreadId: reminder.sourceThreadId });
    await saveState(state);
    return send(res, 201, reminder);
  }
  const reminderMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderMatch && req.method === 'PATCH') {
    const input = await body(req);
    const reminder = state.reminders.find((item) => item.id === reminderMatch[1]);
    if (!reminder) return send(res, 404, { error: 'Reminder not found' });
    if (input.action === 'complete') {
      reminder.status = 'completed';
      reminder.completedAt = new Date().toISOString();
      const evidence = buildSkillEvidence(reminder);
      const skill = state.skills.find((item) => item.id === evidence.skillId) || state.skills[0];
      skill.progress = Math.min(100, skill.progress + 4);
      skill.streak += 1;
      skill.evidence.unshift(evidence.evidence);
      activity(state, 'evidence', `Evidence added to ${skill.name}`, reminder.title);
    } else if (input.action === 'dismiss') reminder.status = 'dismissed';
    else if (input.action === 'snooze') reminder.status = 'snoozed';
    audit(state, input.action || 'update', 'reminder', reminder.id);
    await saveState(state);
    return send(res, 200, { reminder, skills: state.skills });
  }
  if (pathname === '/api/notes' && req.method === 'POST') {
    const input = await body(req);
    if (!input.body?.trim()) return send(res, 400, { error: 'Write something before saving the note.' });
    const note = { id: randomUUID(), title: input.title?.trim() || 'Untitled thought', body: input.body.trim(), tags: input.tags || ['personal'], sourceThreadId: input.sourceThreadId || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.notes.unshift(note);
    activity(state, 'note', 'Notebook updated', note.title);
    audit(state, 'create', 'note', note.id, { sourceThreadId: note.sourceThreadId });
    await saveState(state);
    return send(res, 201, note);
  }
  if (pathname === '/api/mcp/call' && req.method === 'POST') {
    const input = await body(req);
    const tool = mcpTools.find((item) => item.name === input.tool);
    if (!tool) return send(res, 400, { error: 'Tool is not allowlisted.' });
    if (!tool.readOnly && input.confirmed !== true) return send(res, 403, { error: 'This write tool requires explicit confirmation.' });
    let result;
    if (input.tool === 'search_threads') {
      const query = String(input.args?.query || '').toLowerCase();
      result = state.threads.filter((thread) => `${thread.sender} ${thread.subject} ${thread.body}`.toLowerCase().includes(query)).slice(0, 8).map(({ id, sender, subject, preview }) => ({ id, sender, subject, preview }));
    } else if (input.tool === 'list_reminders') result = state.reminders.filter((item) => !input.args?.status || item.status === input.args.status).map(({ id, title, dueAt, status, confidence }) => ({ id, title, dueAt, status, confidence }));
    else if (input.tool === 'list_notes') result = state.notes.slice(0, 8).map(({ id, title, body, tags }) => ({ id, title, body, tags }));
    else if (input.tool === 'get_skill_progress') result = state.skills.map(({ id, name, progress, streak, evidence }) => ({ id, name, progress, streak, evidence: evidence.slice(0, 3) }));
    else if (input.tool === 'complete_reminder') {
      const reminder = state.reminders.find((item) => item.id === input.args?.reminderId);
      if (!reminder) return send(res, 404, { error: 'Reminder not found.' });
      reminder.status = 'completed';
      result = { id: reminder.id, status: reminder.status };
    }
    audit(state, 'mcp_call', 'tool', input.tool, { args: input.args || {}, readOnly: tool.readOnly });
    await saveState(state);
    return send(res, 200, { tool: input.tool, result, audit: state.audit[0] });
  }
  return send(res, 404, { error: 'Route not found' });
}

async function serveStatic(res, pathname) {
  const safe = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(publicDir, safe));
  if (!filePath.startsWith(publicDir)) return send(res, 403, { error: 'Forbidden' });
  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    send(res, 200, content, types[ext] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (jsonRoute(url.pathname, req.method)) return handleApi(req, res, url.pathname);
    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: 'Unexpected server error' });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`TraceForm listening on http://localhost:${port}`));

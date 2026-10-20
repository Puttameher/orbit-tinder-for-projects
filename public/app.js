const app = {
  state: null,
  selectedThreadId: null,
  proposal: null,
  reminderFilter: 'all',
  notifiedReminders: new Set()
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'No date found';
const shortDate = (value) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value)) : 'No deadline';

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Something went wrong');
  return payload;
}

function toast(message, tone = 'success') {
  const region = $('#toast-region');
  const item = document.createElement('div');
  item.className = 'toast';
  item.innerHTML = `<strong>${tone === 'error' ? 'Heads up' : 'TraceForm'}</strong>${esc(message)}`;
  region.append(item);
  window.setTimeout(() => item.remove(), 4200);
  if (tone !== 'error' && app.state?.profile?.notifications && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('TraceForm', { body: message });
  }
}

function checkDueReminders() {
  if (!app.state || !app.state.profile.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  app.state.reminders.filter((item) => item.status === 'upcoming' && item.dueAt).forEach((item) => {
    const due = new Date(item.dueAt).getTime();
    if (due > now && due - now < 24 * 60 * 60 * 1000 && !app.notifiedReminders.has(item.id)) {
      app.notifiedReminders.add(item.id);
      new Notification('TraceForm reminder', { body: `${item.title} · ${shortDate(item.dueAt)}` });
    }
  });
}

function setView(view) {
  $$('.view').forEach((section) => section.classList.toggle('active-view', section.id === `${view}-view`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const labels = { overview: 'Command center', inbox: 'Inbox', reminders: 'Reminders', notes: 'Personal notebook', skills: 'Skill growth', mcp: 'MCP bridge' };
  $('#view-label').textContent = labels[view] || 'Command center';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderOverview() {
  const pending = app.state.reminders.filter((item) => item.status === 'upcoming' || item.status === 'snoozed');
  $('#reminder-count').textContent = pending.length;
  $('#inbox-count').textContent = app.state.threads.filter((item) => item.unread).length;
  $('#attention-title').textContent = `${pending.length} commitment${pending.length === 1 ? '' : 's'} need${pending.length === 1 ? 's' : ''} you`;
  const skill = app.state.skills[0];
  $('#top-skill-progress').textContent = `${skill.progress}%`;
  $('#top-skill-meter').style.width = `${skill.progress}%`;
  $('#top-skill-streak').textContent = skill.streak;
  $('#activity-list').innerHTML = app.state.activity.slice(0, 6).map((item) => `<div class="activity-item"><span class="activity-icon">${item.kind === 'evidence' ? '✦' : item.kind === 'note' ? '✎' : item.kind === 'sync' ? '↻' : '◷'}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p><small class="activity-time">${esc(item.time)}</small></div></div>`).join('');
}

function renderInbox() {
  const list = $('#thread-list');
  list.innerHTML = app.state.threads.map((thread) => `<button class="thread-row ${app.selectedThreadId === thread.id ? 'selected' : ''}" data-thread-id="${esc(thread.id)}"><span class="sender-avatar">${esc(thread.sender.split(' ').map((part) => part[0]).join('').slice(0, 2))}</span><span><strong>${esc(thread.sender)}</strong><span class="subject">${esc(thread.subject)}</span><p>${esc(thread.preview)}</p></span><time>${dateLabel(thread.receivedAt)}</time>${thread.unread ? '<i class="unread-dot"></i>' : ''}</button>`).join('');
  $$('.thread-row').forEach((item) => item.addEventListener('click', () => selectThread(item.dataset.threadId)));
  if (app.selectedThreadId) renderThreadDetail();
}

function renderThreadDetail() {
  const thread = app.state.threads.find((item) => item.id === app.selectedThreadId);
  if (!thread) return;
  const related = app.state.reminders.find((item) => item.sourceThreadId === thread.id && item.status !== 'dismissed');
  $('#thread-detail').innerHTML = `<div class="detail-header"><div><span class="eyebrow detail-label">${esc(thread.label)} · ${esc(thread.source)}</span><h3>${esc(thread.subject)}</h3><p>${esc(thread.sender)} &lt;${esc(thread.senderEmail)}&gt;</p></div><span class="detail-time">${dateLabel(thread.receivedAt)}</span></div><div class="detail-body">${esc(thread.body)}</div>${related ? `<div class="proposal-box"><span class="eyebrow">Saved reminder</span><div class="proposal-title">${esc(related.title)}</div><div class="proposal-meta"><span>${shortDate(related.dueAt)}</span><span>${Math.round(related.confidence * 100)}% confidence</span><span>${esc(related.status)}</span></div><p class="proposal-quote">“${esc(related.sourceQuote)}”</p></div>` : `<div class="agent-box"><div class="agent-box-heading"><strong>Let the agent trace this</strong><span>source → intent → action</span></div><p>TraceForm will look for a real commitment, interpret the deadline, and bring back a proposal with its receipt.</p><button id="extract-button">Run agent extraction <span>✦</span></button><button class="secondary" id="quick-note-button">Save a note</button></div>`}<div class="detail-foot"><span>Message content is untrusted input.</span><button id="detail-note-button">＋ Add context to notebook</button></div>`;
  $('#extract-button')?.addEventListener('click', extractSelected);
  $('#quick-note-button')?.addEventListener('click', focusNote);
  $('#detail-note-button')?.addEventListener('click', focusNote);
}

async function selectThread(id) {
  app.selectedThreadId = id;
  const thread = app.state.threads.find((item) => item.id === id);
  if (thread) thread.unread = false;
  renderInbox();
  renderOverview();
}

async function extractSelected() {
  if (!app.selectedThreadId) return;
  const button = $('#extract-button');
  button.disabled = true;
  button.textContent = 'Tracing signal…';
  try {
    const data = await api('/api/extract-reminder', { method: 'POST', body: JSON.stringify({ threadId: app.selectedThreadId }) });
    app.proposal = data.proposal;
    renderProposal();
    toast('The agent found a commitment and attached its source quote.');
  } catch (error) { toast(error.message, 'error'); button.disabled = false; }
}

function renderProposal() {
  const box = document.querySelector('.agent-box');
  if (!box || !app.proposal) return;
  const p = app.proposal;
  box.className = 'proposal-box';
  box.innerHTML = `<span class="eyebrow">Agent proposal · review required</span><div class="proposal-title">${esc(p.title)}</div><div class="proposal-meta"><span>${esc(p.interpretation)}</span><span>${Math.round(p.confidence * 100)}% confidence</span></div><p class="proposal-quote">“${esc(p.sourceQuote)}”</p><p class="proposal-quote" style="border-top:0;padding-top:0;margin-top:6px;font-style:normal;color:#829b93">${esc(p.reasoning)}</p><div class="proposal-actions"><button class="approve-button" id="approve-proposal">Approve reminder</button><button class="reject-button" id="reject-proposal">Not useful</button></div>`;
  $('#approve-proposal').addEventListener('click', approveProposal);
  $('#reject-proposal').addEventListener('click', () => { app.proposal = null; renderThreadDetail(); toast('Proposal dismissed.'); });
}

async function approveProposal() {
  if (!app.proposal) return;
  try {
    await api('/api/reminders', { method: 'POST', body: JSON.stringify(app.proposal) });
    await refresh();
    app.proposal = null;
    renderThreadDetail();
    toast('Reminder approved. It is now in your review queue.');
  } catch (error) { toast(error.message, 'error'); }
}

function renderReminders() {
  const items = app.state.reminders.filter((item) => app.reminderFilter === 'all' || (app.reminderFilter === 'upcoming' ? ['upcoming', 'snoozed'].includes(item.status) : item.status === 'completed'));
  const board = $('#reminders-board');
  if (!items.length) { board.innerHTML = '<div class="empty-board"><strong>No reminders here.</strong><span>Good. Your attention has room to breathe.</span></div>'; return; }
  board.innerHTML = items.map((item) => `<div class="reminder-row ${item.status === 'completed' ? 'completed' : ''}"><button class="reminder-check ${item.status === 'completed' ? 'done' : ''}" data-complete="${esc(item.id)}">${item.status === 'completed' ? '✓' : ''}</button><div><strong>${esc(item.title)}</strong><p>${esc(item.sourceQuote || 'Personal reminder')} · ${item.status === 'completed' ? 'completed' : esc(item.interpretation || shortDate(item.dueAt))}</p></div><div class="reminder-source"><b>${shortDate(item.dueAt)}</b>${Math.round((item.confidence || .7) * 100)}% clear</div><div class="reminder-actions"><button class="small-action" data-snooze="${esc(item.id)}">Snooze</button><button class="small-action" data-dismiss="${esc(item.id)}">Dismiss</button></div></div>`).join('');
  $$('[data-complete]').forEach((button) => button.addEventListener('click', () => updateReminder(button.dataset.complete, 'complete')));
  $$('[data-snooze]').forEach((button) => button.addEventListener('click', () => updateReminder(button.dataset.snooze, 'snooze')));
  $$('[data-dismiss]').forEach((button) => button.addEventListener('click', () => updateReminder(button.dataset.dismiss, 'dismiss')));
}

async function updateReminder(id, action) {
  try { await api(`/api/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }); await refresh(); toast(action === 'complete' ? 'Completed. The evidence graph got a little stronger.' : `Reminder ${action}d.`); } catch (error) { toast(error.message, 'error'); }
}

function renderNotes() {
  $('#notes-list').innerHTML = app.state.notes.length ? app.state.notes.map((note) => `<article class="note-card"><div class="note-card-head"><h3>${esc(note.title)}</h3><time>${dateLabel(note.updatedAt)}</time></div><p>${esc(note.body)}</p><footer>${note.tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}${note.sourceThreadId ? '<span class="note-link">linked to inbox</span>' : ''}</footer></article>`).join('') : '<div class="empty-board"><strong>Your notebook is blank.</strong><span>Save the first thought that should outlive the task.</span></div>';
}

function renderSkills() {
  $('#skill-summary-count').textContent = app.state.skills.length;
  $('#skill-list').innerHTML = app.state.skills.map((skill) => `<article class="skill-row"><div class="skill-row-head"><div><h3>${esc(skill.name)}</h3><p>${esc(skill.description)}</p></div><span class="skill-score">${skill.progress}%</span></div><div class="meter"><i style="width:${skill.progress}%"></i></div><div class="skill-evidence">${skill.evidence.slice(0, 3).map((item) => `<span>${esc(item)}</span>`).join('')}</div></article>`).join('');
}

async function renderMcp() {
  try {
    const data = await api('/api/mcp/tools');
    $('#tool-list').innerHTML = data.tools.map((tool) => `<div class="tool-item"><span>${esc(tool.name)}</span><b>${tool.readOnly ? 'read-only' : 'confirmed write'}</b></div>`).join('');
  } catch (error) { toast(error.message, 'error'); }
  renderAudit();
}

function renderAudit() {
  $('#audit-list').innerHTML = app.state.audit.length ? app.state.audit.slice(0, 7).map((entry) => `<div class="audit-row"><time>${dateLabel(entry.createdAt)}</time><strong>${esc(entry.action)} <span>${esc(entry.entityType)}</span></strong><span>${entry.metadata?.confidence ? `${Math.round(entry.metadata.confidence * 100)}% confidence` : entry.metadata?.imported ? `${entry.metadata.imported} threads` : 'local user'}</span></div>`).join('') : '<div class="empty-board"><strong>No calls yet.</strong><span>Run one scoped tool call to see the audit trail.</span></div>';
}

async function runMcp() {
  const tool = $('#mcp-tool').value;
  const query = $('#mcp-query').value || 'fellowship';
  const args = tool === 'search_threads' ? { query } : {};
  try { const data = await api('/api/mcp/call', { method: 'POST', body: JSON.stringify({ tool, args }) }); $('#mcp-result').textContent = JSON.stringify(data.result, null, 2); await refresh(); renderAudit(); toast(`${tool} returned a scoped result.`); } catch (error) { $('#mcp-result').textContent = error.message; toast(error.message, 'error'); }
}

function focusNote() { setView('notes'); window.setTimeout(() => $('.note-composer input[name="title"]')?.focus(), 250); }

async function refresh() {
  app.state = await api('/api/state');
  renderOverview(); renderInbox(); renderReminders(); renderNotes(); renderSkills(); renderAudit();
  $('#connect-label').textContent = app.state.connection.connected ? 'Gmail connected' : 'Connect Gmail';
  $('#connect-button').classList.toggle('is-connected', app.state.connection.connected);
  checkDueReminders();
}

async function connectGmail() {
  try { await api('/api/connect', { method: 'POST' }); await refresh(); toast('Gmail is connected in read-only demo mode.'); } catch (error) { toast(error.message, 'error'); }
}

async function syncInbox() {
  const button = $('#sync-button'); button.disabled = true; button.textContent = 'Syncing…';
  try { const data = await api('/api/sync', { method: 'POST' }); await refresh(); toast(`${data.count} inbox signals are ready.`); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; button.innerHTML = 'Sync now <span>↻</span>'; }
}

async function saveNote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try { await api('/api/notes', { method: 'POST', body: JSON.stringify({ title: data.get('title'), body: data.get('body'), tags: String(data.get('tags') || 'personal').split(',').map((tag) => tag.trim()).filter(Boolean), sourceThreadId: app.selectedThreadId }) }); form.reset(); await refresh(); toast('Thought saved to your private notebook.'); } catch (error) { toast(error.message, 'error'); }
}

function bind() {
  document.addEventListener('click', (event) => { const target = event.target.closest('[data-view]'); if (target) setView(target.dataset.view); });
  $('#connect-button').addEventListener('click', connectGmail);
  $('#sync-button').addEventListener('click', syncInbox);
  $('#note-form').addEventListener('submit', saveNote);
  $('#new-note-button').addEventListener('click', focusNote);
  $('#run-mcp-button').addEventListener('click', runMcp);
  $$('.filter-tabs button').forEach((button) => button.addEventListener('click', () => { $$('.filter-tabs button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); app.reminderFilter = button.dataset.filter; renderReminders(); }));
  $('#notification-button').addEventListener('click', async () => { if (!('Notification' in window)) return toast('This browser does not support notifications.', 'error'); const permission = await Notification.requestPermission(); if (permission === 'granted') toast('Notifications are on. TraceForm will nudge you when a reviewed reminder is close.'); else toast('Notifications stay off until you allow them in the browser.', 'error'); });
}

async function init() { bind(); try { await refresh(); } catch (error) { toast(error.message, 'error'); } }
init();
window.setInterval(checkDueReminders, 60_000);

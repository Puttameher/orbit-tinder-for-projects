const app = { state: null, currentProject: null, currentFit: null, screen: 'discover' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value)) : 'now';

async function api(path, options = {}) { const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options }); const result = await response.json(); if (!response.ok) throw new Error(result.message || result.error?.message || result.error || 'Something went wrong'); return result; }
function toast(message, kind = 'success') { const node = document.createElement('div'); node.className = 'toast'; node.innerHTML = `<strong>${kind === 'error' ? 'Riff' : 'Signal'}</strong>${esc(message)}`; $('#toast-region').append(node); window.setTimeout(() => node.remove(), 4000); }

function showLanding() { $('#workspace').classList.add('hidden'); $('#landing').classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function showWorkspace() { $('#landing').classList.add('hidden'); $('#workspace').classList.remove('hidden'); await refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function artClass(project) { return project?.visual || 'pantry'; }

function renderCard(project, index, front = false) { return `<article class="project-card ${front ? 'front' : ''}" data-project-id="${esc(project.id)}"><div class="card-art ${esc(artClass(project))}"><small>${esc(project.kicker)}</small><span class="card-visual-label">${esc(project.stage)}</span></div><div class="card-info"><span class="card-kicker">${esc(project.signal)}</span><h3>${esc(project.title)}</h3><p>${esc(project.summary)}</p><div class="card-footer"><div class="card-tags">${project.tags.slice(0, 3).map((tag) => `<span>${esc(tag)}</span>`).join('')}</div><div class="card-owner"><b>${esc(project.owner.name)}</b><small>${esc(project.owner.role)}</small></div></div></div></article>`; }

function renderDeck() {
  const projects = app.state?.discover || [];
  $('#remaining-count').textContent = String(projects.length).padStart(2, '0');
  if (!projects.length) { $('#deck').innerHTML = '<div class="empty-deck"><strong>Your orbit is quiet.</strong><span>Reset the demo state or come back later for a new signal.</span></div>'; app.currentProject = null; return; }
  app.currentProject = projects[0]; $('#deck').innerHTML = projects.slice(0, 3).reverse().map((project, index, arr) => renderCard(project, arr.length - index - 1, index === arr.length - 1)).join('');
  app.currentFit = null; $('#agent-empty').classList.remove('hidden'); $('#agent-result').classList.add('hidden');
}

function renderMatches() {
  const matches = app.state.matches.map((match) => ({ match, project: app.state.projects.find((item) => item.id === match.projectId) })).filter((item) => item.project);
  $('#match-count').textContent = matches.length;
  $('#matches-grid').innerHTML = matches.length ? matches.map(({ match, project }) => `<article class="match-card"><div class="mini-art ${esc(artClass(project))}"></div><h3>${esc(project.title)}</h3><p>You + ${esc(project.owner.name)} · ${esc(project.owner.role)}</p><div class="match-fit"><span>mutual interest</span><b>open</b></div><button data-match-detail="${esc(project.id)}">Open match ↗</button></article>`).join('') : '<div class="empty-result"><strong>No matches yet.</strong><span>Like a project with a reciprocal signal and see what happens.</span></div>';
  $$('[data-match-detail]').forEach((button) => button.addEventListener('click', () => openProjectModal(button.dataset.matchDetail)));
}

function renderSaved() {
  const saved = app.state.saved.map((id) => app.state.projects.find((project) => project.id === id)).filter(Boolean);
  $('#saved-grid').innerHTML = saved.length ? saved.map((project) => `<article class="saved-card"><div class="mini-art ${esc(artClass(project))}"></div><h3>${esc(project.title)}</h3><p>${esc(project.summary)}</p><button data-open-project="${esc(project.id)}">Open project ↗</button></article>`).join('') : '<div class="empty-result"><strong>Your shortlist is empty.</strong><span>Keep the maybe. Save a project from Discover.</span></div>';
  $$('[data-open-project]').forEach((button) => button.addEventListener('click', () => openProjectModal(button.dataset.openProject)));
}

function renderRemixes() { $('#remixes-list').innerHTML = app.state.remixes.length ? app.state.remixes.map((remix) => `<article class="remix-row"><span>↗</span><div><h3>${esc(remix.title)}</h3><p>${esc(remix.firstMilestone)} · ${esc(remix.status)} · ${dateLabel(remix.createdAt)}</p></div><button data-remix-detail="${esc(remix.id)}">Open brief ↗</button></article>`).join('') : '<div class="empty-result"><strong>No riffs yet.</strong><span>Open the agent on a project and ask it to create a separate remix brief.</span></div>'; $$('[data-remix-detail]').forEach((button) => button.addEventListener('click', () => openRemixModal(button.dataset.remixDetail))); }

function switchScreen(screen) { app.screen = screen; const labels = { discover: 'Discover', matches: 'Matches', saved: 'Saved', remixes: 'Remixes' }; $$('.workspace-screen').forEach((item) => item.classList.toggle('active-screen', item.id === `${screen}-screen`)); $$('.workspace-nav-item').forEach((item) => item.classList.toggle('active', item.dataset.screen === screen)); $('#workspace-screen-name').textContent = labels[screen]; window.scrollTo({ top: 0, behavior: 'smooth' }); }

async function swipe(decision) {
  if (!app.currentProject) return;
  const card = document.querySelector('.project-card.front'); if (card) { card.classList.add(decision === 'like' ? 'swipe-right' : 'swipe-left'); }
  try { const result = await api('/api/rally/swipe', { method: 'POST', body: JSON.stringify({ projectId: app.currentProject.id, decision }) }); await refresh(); if (result.match) openMatchModal(app.currentProject); else toast(decision === 'like' ? 'Signal sent. The orbit moved.' : decision === 'save' ? 'Saved to your shortlist.' : 'Passed. Your signal is clearer.'); } catch (error) { toast(error.message, 'error'); }
}

async function runFit(project = app.currentProject) { if (!project) return; $('#agent-empty').classList.add('hidden'); $('#agent-result').classList.remove('hidden'); $('#agent-result').innerHTML = '<div class="agent-loading"><span>✦</span><p>Reading the overlap…</p></div>'; try { const result = await api(`/api/rally/projects/${project.id}/fit`, { method: 'POST', body: JSON.stringify({}) }); app.currentFit = result.fit; renderAgent(result.fit, project); } catch (error) { toast(error.message, 'error'); } }
function renderAgent(fit, project) { $('#agent-result').innerHTML = `<div class="fit-score"><small>PROJECT FIT · ${esc(project.title)}</small><strong>${fit.score}%</strong></div><div class="agent-bar"><i style="width:${fit.score}%"></i></div><div class="agent-list">${fit.strengths.map((item) => `<div><span>+</span><p><b>${esc(item)}</b><small>visible match</small></p></div>`).join('')}</div><div class="agent-tradeoff"><b>One trade-off</b><br />${esc(fit.tradeoffs[0])}</div><div class="agent-actions"><button id="agent-remix">Remix this</button><button class="secondary" id="agent-intro">Draft intro</button></div>`; $('#agent-remix').addEventListener('click', () => createRemix(project)); $('#agent-intro').addEventListener('click', () => createIntro(project, fit)); }

async function createRemix(project) { try { const result = await api('/api/rally/remix', { method: 'POST', body: JSON.stringify({ projectId: project.id }) }); openRemixModal(result.remix.id); await refresh(); toast('A separate remix brief is ready.'); } catch (error) { toast(error.message, 'error'); } }
async function createIntro(project, fit) { try { const result = await api('/api/rally/introduction', { method: 'POST', body: JSON.stringify({ projectId: project.id }) }); openIntroModal(project, result.draft); } catch (error) { toast(error.message, 'error'); } }

function openMatchModal(project) { $('#modal').innerHTML = `<div class="modal-top"><div><span class="eyebrow lime">Mutual signal</span><h3>It pulls both ways.</h3></div><button class="modal-close" data-close-modal>×</button></div><div class="match-orbit"><span>✦</span></div><p>You and <b>${esc(project.owner.name)}</b> both showed interest in <b>${esc(project.title)}</b>. That is enough for a next step, not a commitment.</p><div class="modal-actions"><button data-intro-modal="${esc(project.id)}">Draft an intro ↗</button><button class="secondary" data-close-modal>Keep exploring</button></div>`; openModal(); $('#modal [data-intro-modal]').addEventListener('click', () => createIntro(project, app.currentFit || { strengths: ['shared purpose'] })); }
function openProjectModal(id) { const project = app.state.projects.find((item) => item.id === id); if (!project) return; $('#modal').innerHTML = `<div class="modal-top"><div><span class="eyebrow coral">${esc(project.kicker)}</span><h3>${esc(project.title)}</h3></div><button class="modal-close" data-close-modal>×</button></div><div class="mini-art ${esc(artClass(project))}" style="height:140px;border-radius:5px;margin:17px 0"></div><p>${esc(project.description)}</p><div class="modal-actions"><button data-modal-fit="${esc(project.id)}">Read fit ↗</button><button class="secondary" data-modal-remix="${esc(project.id)}">Remix plan</button></div>`; openModal(); $('#modal [data-modal-fit]').addEventListener('click', () => { closeModal(); switchScreen('discover'); app.currentProject = project; runFit(project); }); $('#modal [data-modal-remix]').addEventListener('click', () => createRemix(project)); }
function openIntroModal(project, draft) { $('#modal').innerHTML = `<div class="modal-top"><div><span class="eyebrow lime">Draft only · never sent</span><h3>Start with a human note.</h3></div><button class="modal-close" data-close-modal>×</button></div><p>The agent found a first sentence. Edit it until it sounds like you.</p><textarea class="intro-text" id="intro-text">${esc(draft)}</textarea><div class="modal-actions"><button data-close-modal>Keep draft</button><button class="secondary" data-close-modal>Close</button></div>`; openModal(); }
function openRemixModal(id) { const remix = app.state.remixes.find((item) => item.id === id); if (!remix) return; $('#modal').innerHTML = `<div class="modal-top"><div><span class="eyebrow gold">Separate fork brief</span><h3>${esc(remix.title)}</h3></div><button class="modal-close" data-close-modal>×</button></div><div class="remix-detail"><div><b>Preserve</b><p>${esc(remix.preserve)}</p></div><div><b>Change</b><p>${esc(remix.change)}</p></div><div><b>First milestone</b><p>${esc(remix.firstMilestone)}</p></div><div><b>Open questions</b><p>${remix.questions.map(esc).join('<br />')}</p></div></div><div class="modal-actions"><button data-close-modal>Keep this brief</button></div>`; openModal(); }
function openModal() { $('#modal-layer').classList.remove('hidden'); $$('#modal [data-close-modal]').forEach((button) => button.addEventListener('click', closeModal)); }
function closeModal() { $('#modal-layer').classList.add('hidden'); }

async function refresh() { app.state = await api('/api/rally/state'); renderDeck(); renderMatches(); renderSaved(); renderRemixes(); }

function bind() {
  $('#enter-workspace').addEventListener('click', showWorkspace); $('#hero-enter').addEventListener('click', showWorkspace); $('#bottom-enter').addEventListener('click', showWorkspace); $('#back-landing').addEventListener('click', (event) => { event.preventDefault(); showLanding(); });
  $$('.workspace-nav-item').forEach((button) => button.addEventListener('click', () => switchScreen(button.dataset.screen)));
  $('#pass-project').addEventListener('click', () => swipe('pass')); $('#like-project').addEventListener('click', () => swipe('like')); $('#save-project').addEventListener('click', () => swipe('save')); $('#run-fit-empty').addEventListener('click', () => runFit());
  $('#signal-demo').addEventListener('click', () => { $('#fit-demo').classList.toggle('expanded'); toast('Fit reads stay grounded in visible context.'); });
  $('#modal-layer').addEventListener('click', (event) => { if (event.target.id === 'modal-layer') closeModal(); });
  document.addEventListener('keydown', (event) => { if ($('#workspace').classList.contains('hidden') || !app.currentProject || !$('#modal-layer').classList.contains('hidden')) return; if (event.key === 'ArrowLeft') swipe('pass'); if (event.key === 'ArrowRight') swipe('like'); if (event.key === ' ') { event.preventDefault(); swipe('save'); } });
}

async function init() { bind(); try { await refresh(); } catch (error) { toast(error.message, 'error'); } }
init();

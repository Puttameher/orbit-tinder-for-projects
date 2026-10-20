const app = { state: null, current: null, screen: 'discover', query: '', analyzing: false, swiping: false, pointer: null, suppressClick: false };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || result.error || result.message || 'Orbit request failed.');
  return result;
}

function toast(message, tone = 'success') {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<strong>${tone === 'error' ? 'Orbit' : 'Signal'}</strong>${esc(message)}`;
  $('#toast-region').append(node);
  window.setTimeout(() => node.remove(), 4000);
}

function setComposer(open) {
  const overlay = $('#composer-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !open);
  overlay.setAttribute('aria-hidden', String(!open));
  if (open) window.setTimeout(() => overlay.querySelector('input')?.focus(), 20);
}

async function createOpportunity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const split = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  const submit = form.querySelector('.composer-submit');
  submit.disabled = true;
  submit.innerHTML = 'Adding signal <span>…</span>';
  try {
    const result = await api('/api/orbit/opportunities', {
      method: 'POST',
      body: JSON.stringify({
        title: data.get('title'),
        category: data.get('category'),
        summary: data.get('summary'),
        tags: split(data.get('tags')),
        skills: split(data.get('skills')),
        needs: split(data.get('needs')),
        commitment: data.get('commitment')
      })
    });
    form.reset();
    setComposer(false);
    await refresh();
    toast(`${result.opportunity.title} is now in your Orbit.`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Add to Orbit <span>↗</span>';
  }
}

function artClass(project) {
  const text = [project?.kind, project?.title, project?.kicker, ...(project?.tags || [])].join(' ');
  return /climate|water|civic/i.test(text) ? 'climate' : /research|paper|ai|learning/i.test(text) ? 'research' : 'default';
}

function categoryFor(project) {
  const text = [project?.kind, project?.title, project?.kicker, ...(project?.tags || [])].join(' ');
  if (/research|paper|publication|learning|ai/i.test(text)) return 'research';
  if (/open source|source available|github|contribution/i.test(`${project?.license || ''} ${text}`)) return 'opensource';
  return 'projects';
}

function searchable(project) {
  return [project.title, project.summary, project.description, project.kicker, project.kind, project.license, project.owner?.name, ...(project.tags || []), ...(project.needs || [])].join(' ').toLowerCase();
}

function visibleDiscover() {
  const discover = app.state?.discover || [];
  return app.query ? discover.filter((project) => searchable(project).includes(app.query)) : discover;
}

function renderProject() {
  const project = app.current;
  const card = $('#project-card');
  $('#opportunity-count').textContent = String(visibleDiscover().length).padStart(2, '0');
  $('#sidebar-discover-count').textContent = String(app.state?.discover?.length || 0).padStart(2, '0');
  if (!project) {
    $('#project-title').textContent = app.query ? 'No signal found' : 'Your orbit is quiet';
    $('#project-summary').textContent = app.query ? 'Try a broader search across your opportunity field.' : 'No more opportunities are waiting in this pass.';
    $('#project-kicker').textContent = 'ORBIT · PAUSE';
    $('#project-stage').textContent = 'NO SIGNAL';
    $('#project-tags').innerHTML = '';
    $('#project-owner').textContent = 'Orbit catalog';
    $('#project-commitment').textContent = 'keep exploring';
    card.className = 'project-card main-card';
    $$('.swipe-control').forEach((button) => { button.disabled = true; });
    return;
  }
  $('#project-title').textContent = project.title;
  $('#project-summary').textContent = project.summary;
  $('#project-kicker').textContent = `${String(project.kind || 'project').toUpperCase()} · ${String(project.stage || 'opportunity').toUpperCase()}`;
  $('#project-stage').textContent = String(project.license || 'SOURCE VERIFIED').toUpperCase();
  $('#project-signal').textContent = String(project.signal || 'DECLARED CONTEXT').toUpperCase();
  $('#project-owner').textContent = project.owner?.name || 'Orbit catalog';
  $('#project-commitment').textContent = project.commitment || 'commitment not declared';
  $('#project-tags').innerHTML = (project.tags || []).slice(0, 3).map((tag) => `<span>${esc(tag)}</span>`).join('');
  $('#project-art').className = `project-art ${artClass(project)}`;
  $$('.swipe-control').forEach((button) => { button.disabled = false; });
}

function cardMarkup(project, compact = false) {
  return `<article class="${compact ? 'collection-card' : 'category-card'}"><div class="${compact ? 'collection-art' : 'category-art'} ${artClass(project)}"></div><small>${esc(project.kicker || `${categoryFor(project)} · ${project.stage || 'opportunity'}`)}</small><h3>${esc(project.title)}</h3><p>${esc(project.summary)}</p><button type="button" data-open-project="${esc(project.id)}">Analyze ↗</button></article>`;
}

function emptyMarkup(title, detail) {
  return `<div class="empty-state"><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>`;
}

function renderCategoryScreens() {
  const projects = app.state?.projects || [];
  ['research', 'projects', 'opensource'].forEach((category) => {
    const filtered = projects.filter((project) => categoryFor(project) === category && (!app.query || searchable(project).includes(app.query)));
    const grid = $(`#${category}-grid`);
    if (grid) grid.innerHTML = filtered.length ? filtered.map((project) => cardMarkup(project)).join('') : emptyMarkup(app.query ? 'No matching signals' : 'This field is still forming', app.query ? 'Try a different phrase or clear the search.' : 'Orbit will place the next relevant opportunity here.');
  });
}

function renderCollections() {
  const projects = app.state?.projects || [];
  const matches = (app.state?.matches || []).map((match) => projects.find((project) => project.id === match.projectId)).filter(Boolean);
  $('#nav-match-count').textContent = matches.length;
  $('#matches-grid').innerHTML = matches.length ? matches.map((project) => cardMarkup(project, true)).join('') : emptyMarkup('No matches yet', 'Like a reciprocal opportunity to create a mutual signal.');
  const saved = (app.state?.saved || []).map((id) => projects.find((project) => project.id === id)).filter(Boolean);
  $('#sidebar-saved-count').textContent = saved.length;
  $('#saved-grid').innerHTML = saved.length ? saved.map((project) => cardMarkup(project, true)).join('') : emptyMarkup('Nothing saved yet', 'Use maybe or save to keep an opportunity close.');
  $('#remix-list').innerHTML = app.state?.remixes?.length ? app.state.remixes.map((remix) => `<article class="remix-row"><span>↗</span><div><h3>${esc(remix.sourceTitle || remix.title)}</h3><p>${esc(remix.firstMilestone)} · ${esc(remix.status)}</p></div><button data-remix="${esc(remix.id)}" type="button">Open brief</button></article>`).join('') : emptyMarkup('No remix briefs yet', 'Ask Orbit Lens to create a reversible plan.');
}

function renderProfile() {
  const profile = app.state?.profile || {};
  $('#profile-name').value = profile.name || '';
  $('#profile-interests').value = (profile.interests || []).join(', ');
  $('#profile-skills').value = (profile.skills || []).join(', ');
  $('#profile-availability').value = profile.availability?.label || profile.availability || '';
}

function switchScreen(screen) {
  app.screen = screen;
  const labels = { discover: 'Discover', research: 'Research papers', projects: 'Projects', opensource: 'Open source', matches: 'Matches', saved: 'Saved', remixes: 'Remixes', profile: 'Profile context' };
  $$('.app-screen').forEach((section) => section.classList.toggle('active', section.id === `${screen}-screen`));
  $$('[data-screen]').forEach((button) => button.classList.toggle('active', button.dataset.screen === screen));
  $('#screen-label').textContent = labels[screen] || 'Discover';
  if (screen === 'profile') renderProfile();
}

async function refresh() {
  app.state = await api('/api/orbit/state');
  const visible = visibleDiscover();
  app.current = visible[0] || null;
  renderProject();
  renderCollections();
  renderCategoryScreens();
  renderProfile();
}

async function analyze() {
  if (!app.current || app.analyzing) return;
  app.analyzing = true;
  $('#agent-state').textContent = 'analyzing';
  $('#lens-copy').classList.add('hidden');
  $('#analysis-result').classList.remove('hidden');
  $('#analysis-result').innerHTML = '<div class="analysis-loading"><span>✦</span><p>Mapping the fit…</p></div>';
  try {
    const run = await api(`/api/orbit/opportunities/${encodeURIComponent(app.current.id)}/analyze`, { method: 'POST', body: '{}' });
    const fit = run.fit;
    $('#analysis-result').innerHTML = `<small>Orbit Lens · local summary · ${esc(run.summary?.category || 'opportunity')}</small><h3>${esc(app.current.title)}</h3><p>${esc(run.summary?.overview || app.current.summary)}</p><div class="analysis-score"><div><b>${fit.score}%</b><span>declared fit score</span></div><span>${esc(fit.method)}</span></div><div class="analysis-list">${(run.summary?.whyItMayFit || fit.strengths).slice(0, 2).map((item) => `<div><i>+</i><span>${esc(item)}</span></div>`).join('')}${(run.summary?.watchouts || fit.gaps).slice(0, 1).map((item) => `<div><i>!</i><span>${esc(item)}</span></div>`).join('')}</div><div class="analysis-collaboration"><b>Collaboration angle:</b> ${esc(run.summary?.collaborationAngle || 'Review the declared needs with the owner.')}</div><div class="analysis-next"><b>Next action:</b> ${esc(run.nextActions.actions[0]?.title || 'Review the evidence')}</div>`;
    $('#agent-state').textContent = 'insight ready';
  } catch (error) {
    toast(error.message, 'error');
    $('#analysis-result').classList.add('hidden');
    $('#lens-copy').classList.remove('hidden');
    $('#agent-state').textContent = 'ready';
  } finally { app.analyzing = false; }
}

async function swipe(decision, message) {
  if (!app.current || app.swiping) return;
  app.swiping = true;
  const currentId = app.current.id;
  const card = $('#project-card');
  card.classList.remove('dragging');
  card.classList.add(decision === 'like' ? 'swipe-right' : decision === 'pass' ? 'swipe-left' : 'swipe-save');
  try {
    const result = await api('/api/orbit/swipe', { method: 'POST', body: JSON.stringify({ projectId: currentId, decision }) });
    toast(result.match ? 'Mutual interest found. Match created.' : message);
    window.setTimeout(() => refresh().catch((error) => toast(error.message, 'error')), 410);
  } catch (error) {
    card.classList.remove('swipe-left', 'swipe-right', 'swipe-save');
    toast(error.message, 'error');
  } finally { app.swiping = false; }
}

async function saveProfile(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await api('/api/orbit/profile', { method: 'PATCH', body: JSON.stringify({ name: data.get('name'), interests: String(data.get('interests')).split(',').map((value) => value.trim()).filter(Boolean), skills: String(data.get('skills')).split(',').map((value) => value.trim()).filter(Boolean), availability: data.get('availability') }) });
    await refresh();
    toast('Profile context saved. Ranking will use it on the next pass.');
  } catch (error) { toast(error.message, 'error'); }
}

function resetCardPosition() {
  const card = $('#project-card');
  if (!card) return;
  card.classList.remove('dragging');
  card.style.transform = '';
  $$('.corner-lens').forEach((lens) => lens.classList.remove('active'));
}

function lensContains(clientX, clientY) {
  return $$('[data-lens-target]').some((lens) => { const rect = lens.getBoundingClientRect(); return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom; });
}

function bindPointerSwipe() {
  const card = $('#project-card');
  if (!card) return;
  card.addEventListener('pointerdown', (event) => {
    if (!app.current || app.swiping || event.button > 0) return;
    app.pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
    card.setPointerCapture?.(event.pointerId);
    card.classList.add('dragging');
  });
  card.addEventListener('pointermove', (event) => {
    if (!app.pointer || event.pointerId !== app.pointer.id) return;
    app.pointer.x = event.clientX; app.pointer.y = event.clientY;
    const dx = event.clientX - app.pointer.startX; const dy = event.clientY - app.pointer.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) app.pointer.moved = true;
    if (!app.pointer.moved) return;
    const rotate = Math.max(-18, Math.min(18, dx / 15));
    card.style.transform = `translate(${dx}px, ${dy * .35}px) rotate(${rotate}deg)`;
    const lensActive = lensContains(event.clientX, event.clientY);
    $$('.corner-lens').forEach((lens) => lens.classList.toggle('active', lensActive && lens.getBoundingClientRect().left <= event.clientX && lens.getBoundingClientRect().right >= event.clientX));
  });
  const release = (event) => {
    if (!app.pointer || event.pointerId !== app.pointer.id) return;
    const pointer = app.pointer; app.pointer = null;
    const dx = pointer.x - pointer.startX;
    const overLens = lensContains(pointer.x, pointer.y);
    card.releasePointerCapture?.(event.pointerId);
    if (pointer.moved) app.suppressClick = true;
    if (overLens) { resetCardPosition(); analyze(); return; }
    if (Math.abs(dx) >= 100) { swipe(dx > 0 ? 'like' : 'pass', dx > 0 ? 'Super-like recorded.' : 'Opportunity dismissed.'); return; }
    resetCardPosition();
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

function bind() {
  $$('[data-screen]').forEach((button) => button.addEventListener('click', () => switchScreen(button.dataset.screen)));
  $('#analyze-button').addEventListener('click', analyze);
  $('#pass-button').addEventListener('click', () => swipe('pass', 'Opportunity dismissed.'));
  $('#maybe-button').addEventListener('click', () => swipe('save', 'Marked maybe. It is waiting in your shortlist.'));
  $('#save-button').addEventListener('click', () => swipe('save', 'Saved to your Orbit shortlist.'));
  $('#like-button').addEventListener('click', () => swipe('like', 'Super-like recorded.'));
  $('#profile-form').addEventListener('submit', saveProfile);
  $$('[data-lens-target]').forEach((lens) => { lens.addEventListener('click', analyze); lens.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); analyze(); } }); });
  document.addEventListener('click', (event) => {
    if (app.suppressClick) { app.suppressClick = false; return; }
    const button = event.target.closest('[data-open-project]');
    if (!button || !app.state) return;
    const project = app.state.projects.find((item) => item.id === button.dataset.openProject);
    if (project) { app.current = project; switchScreen('discover'); renderProject(); analyze(); }
  });
  $('#opportunity-search').addEventListener('input', (event) => { app.query = event.target.value.trim().toLowerCase(); const visible = visibleDiscover(); app.current = visible[0] || null; $('#search-status').textContent = app.query ? `${visible.length} matching signal${visible.length === 1 ? '' : 's'} in your field` : 'All signals · ranked by declared context'; $('#clear-search').hidden = !app.query; renderProject(); renderCategoryScreens(); });
  $('#clear-search').addEventListener('click', () => { $('#opportunity-search').value = ''; app.query = ''; $('#opportunity-search').dispatchEvent(new Event('input')); $('#opportunity-search').focus(); });
  $('#command-button').addEventListener('click', () => $('#opportunity-search').focus());
  $('#profile-menu').addEventListener('click', () => switchScreen('profile'));
  $('#add-opportunity-button').addEventListener('click', () => setComposer(true));
  $('#composer-close').addEventListener('click', () => setComposer(false));
  $('#composer-cancel').addEventListener('click', () => setComposer(false));
  $('#composer-overlay').addEventListener('click', (event) => { if (event.target.id === 'composer-overlay') setComposer(false); });
  $('#opportunity-form').addEventListener('submit', createOpportunity);
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.key === 'Escape') { setComposer(false); if (target.matches('input,textarea,select')) target.blur(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#opportunity-search').focus(); return; }
    if (event.key === 'ArrowLeft') swipe('pass', 'Opportunity dismissed.');
    if (event.key === 'ArrowRight') swipe('like', 'Super-like recorded.');
    if (event.key === ' ') { event.preventDefault(); swipe('save', 'Saved to your Orbit shortlist.'); }
  });
  bindPointerSwipe();
}

bind();
refresh().catch((error) => toast(error.message, 'error'));

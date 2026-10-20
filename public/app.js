const app = { state: null, view: 'home', styleAsset: null, styleOccasion: 'everyday', styleGeneration: null, createAssets: [], createFormat: 'Instagram carousel', createDirection: 'natural warmth', contentGeneration: null, libraryFilter: 'all' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const dateLabel = (value) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value)) : 'now';

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || result.error?.message || result.error || 'Something went wrong');
  return result;
}

function toast(message, kind = 'success') {
  const region = $('#toast-region'); const node = document.createElement('div'); node.className = 'toast';
  node.innerHTML = `<strong>${kind === 'error' ? 'Evorin' : 'Saved'}</strong>${esc(message)}`; region.append(node); window.setTimeout(() => node.remove(), 4000);
}

function setView(view) {
  app.view = view; const labels = { home: 'Home', style: 'Style me', create: 'Create', library: 'My library', taste: 'My taste' };
  $$('.view').forEach((section) => section.classList.toggle('active-view', section.id === `${view}-view`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#page-name').textContent = labels[view] || 'Home'; window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'library') renderLibrary(); if (view === 'taste') renderTaste();
}

function artFor(name) { return `<div class="visual-art ${esc(name || 'look-sunday')}"></div>`; }

function renderHome() {
  $('#recent-strip').innerHTML = app.state.savedExamples.slice(0, 3).map((item) => `<button class="recent-card" data-view="library">${artFor(item.visual)}<span class="recent-info"><span><b>${esc(item.title)}</b><small>${esc(item.subtitle)}</small></span><span>↗</span></span></button>`).join('');
}

function fileToPayload(file, kind) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, data: reader.result, kind }); reader.onerror = reject; reader.readAsDataURL(file); });
}

async function uploadFiles(files, kind) {
  if (!files.length) return [];
  const payload = await Promise.all([...files].slice(0, 12).map((file) => fileToPayload(file, kind)));
  const result = await api('/api/evorin/upload', { method: 'POST', body: JSON.stringify({ files: payload }) });
  toast(`${result.assets.length} visual${result.assets.length === 1 ? '' : 's'} added to your private space.`); return result.assets;
}

function renderStylePreview() {
  const box = $('#style-preview');
  if (!app.styleAsset) { box.className = 'selected-preview'; box.innerHTML = ''; return; }
  box.className = 'selected-preview has-image'; box.innerHTML = `<img src="${esc(app.styleAsset.data)}" alt="Uploaded style reference" /><div><b>${esc(app.styleAsset.name)}</b><small>Ready to read · ${Math.round(app.styleAsset.sizeBytes / 1024)} KB</small></div><button class="remove-asset" id="remove-style" title="Remove image">×</button>`;
  $('#style-upload-status').textContent = '1 visual selected';
  $('#remove-style').addEventListener('click', () => removeAsset(app.styleAsset.id, 'style'));
}

async function handleStyleFiles(event) {
  try { const assets = await uploadFiles(event.target.files, 'style'); app.styleAsset = assets[0]; renderStylePreview(); } catch (error) { toast(error.message, 'error'); }
}

function renderStyleResult() {
  const root = $('#style-result');
  if (!app.styleGeneration) { root.innerHTML = '<div class="empty-result"><strong>Your next look starts with a visual.</strong><span>Upload an outfit above, choose an occasion, and let Evorin make a point of view.</span></div>'; return; }
  const result = app.styleGeneration.result;
  root.innerHTML = `<div class="result-heading"><div><span class="eyebrow">03 · A point of view</span><h2>${esc(result.title)}</h2></div><span>${Math.round(result.confidence * 100)}% confidence · grounded in ${result.preferenceTrace.length} taste signals</span></div><div class="recommendation-grid">${result.recommendations.map((rec, index) => `<article class="recommendation-card"><span class="rec-number">0${index + 1} · ${esc(rec.category)}</span><h3>${esc(rec.value)}</h3><p>${esc(rec.rationale)}</p></article>`).join('')}</div><div class="result-actions"><span class="why-link">Why this works: <b>${esc(result.preferenceTrace.map((item) => item.label).join(' · '))}</b></span><div class="feedback-actions"><button data-style-feedback="accept">More like this</button><button data-style-feedback="reject">Less like this</button><button id="save-style">Save look</button><button id="export-style">Export</button></div></div><div class="preference-trace">${result.preferenceTrace.map((item) => `<span>${esc(item.label)} · ${Math.round(item.score * 100)}%</span>`).join('')}</div>`;
  $$('[data-style-feedback]').forEach((button) => button.addEventListener('click', () => sendFeedback(button.dataset.styleFeedback, 'styling', result.sourcePreferenceIds?.[0], app.styleGeneration.id)));
  $('#save-style').addEventListener('click', () => saveGeneration(app.styleGeneration.id, 'Soft structure, made yours'));
  $('#export-style').addEventListener('click', () => exportGeneration(app.styleGeneration.id));
}

async function generateStyle() {
  if (!app.styleAsset) { toast('Upload one visual first so I can ground the recommendation.', 'error'); return; }
  const button = $('#style-generate'); button.disabled = true; button.innerHTML = 'Reading your look… <span>✦</span>';
  try { const data = await api('/api/evorin/style/recommend', { method: 'POST', body: JSON.stringify({ assetId: app.styleAsset.id, occasion: app.styleOccasion }) }); app.styleGeneration = data.generation; renderStyleResult(); toast('Your recommendation is grounded in your current taste signals.'); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; button.innerHTML = 'Read my look <span>✦</span>'; }
}

function renderCreatePreview() {
  $('#create-count').textContent = `${app.createAssets.length} selected`;
  $('#create-preview').innerHTML = app.createAssets.map((asset, index) => `<div class="thumb"><img src="${esc(asset.data)}" alt="Selected photo ${index + 1}" /><span>${index + 1}</span><button class="remove-asset" data-remove-asset="${esc(asset.id)}" title="Remove photo">×</button></div>`).join('');
  $$('[data-remove-asset]').forEach((button) => button.addEventListener('click', () => removeAsset(button.dataset.removeAsset, 'content')));
}

async function handleCreateFiles(event) { try { app.createAssets = await uploadFiles(event.target.files, 'content'); renderCreatePreview(); } catch (error) { toast(error.message, 'error'); } }
async function removeAsset(id, kind) { try { await api(`/api/evorin/assets/${id}`, { method: 'DELETE' }); if (kind === 'style') app.styleAsset = null; else app.createAssets = app.createAssets.filter((asset) => asset.id !== id); renderStylePreview(); renderCreatePreview(); await refresh(); toast('Visual removed from this space.'); } catch (error) { toast(error.message, 'error'); } }

function renderContentResult() {
  const root = $('#content-result');
  if (!app.contentGeneration) { root.innerHTML = '<div class="empty-result"><strong>A story needs a handful of moments.</strong><span>Choose two or more photos, then let Evorin find the thread between them.</span></div>'; return; }
  const result = app.contentGeneration.result;
  root.innerHTML = `<div class="content-result"><div class="content-preview"></div><div class="content-copy"><span class="eyebrow">03 · Editable package · ${esc(result.format)}</span><h2>${esc(result.direction)}</h2><p>Evorin kept the edit direction at <b>${esc(result.editDirection)}</b> and wrote in your preference for <b>${esc(result.captionDirection)}</b>. Every field below is yours to change.</p><div class="caption-box"><b>${esc(result.caption)}</b><span>${result.hashtags.map(esc).join('  ')}</span></div><div class="preference-trace">${result.preferenceTrace.map((item) => `<span>${esc(item.label)} · ${Math.round(item.score * 100)}%</span>`).join('')}</div><div class="result-actions"><span class="why-link">${result.selectedAssets.length} photos · human review required</span><div class="feedback-actions"><button data-content-feedback="accept">More like this</button><button data-content-feedback="reject">Less like this</button><button id="save-content">Save package</button><button id="export-content">Export</button></div></div></div></div>`;
  $$('[data-content-feedback]').forEach((button) => button.addEventListener('click', () => sendFeedback(button.dataset.contentFeedback, 'social', result.preferenceTrace?.[0]?.id, app.contentGeneration.id)));
  $('#save-content').addEventListener('click', () => saveGeneration(app.contentGeneration.id, 'A quiet afternoon'));
  $('#export-content').addEventListener('click', () => exportGeneration(app.contentGeneration.id));
}

async function generateContent() {
  if (!app.createAssets.length) { toast('Choose at least one photo first.', 'error'); return; }
  const button = $('#content-generate'); button.disabled = true; button.innerHTML = 'Finding the thread… <span>✦</span>';
  try { const data = await api('/api/evorin/content/create', { method: 'POST', body: JSON.stringify({ assetIds: app.createAssets.map((item) => item.id), format: app.createFormat, direction: app.createDirection }) }); app.contentGeneration = data.generation; renderContentResult(); toast('Your editable content package is ready.'); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; button.innerHTML = 'Compose the story <span>✦</span>'; }
}

async function saveGeneration(generationId, title) { try { await api('/api/evorin/save', { method: 'POST', body: JSON.stringify({ generationId, title }) }); await refresh(); toast('Saved to My library.'); } catch (error) { toast(error.message, 'error'); } }
async function exportGeneration(generationId) { try { const manifest = await api('/api/evorin/export', { method: 'POST', body: JSON.stringify({ generationId }) }); const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${manifest.exportId}.json`; link.click(); URL.revokeObjectURL(link.href); toast('Export manifest downloaded.'); } catch (error) { toast(error.message, 'error'); } }

async function sendFeedback(signal, scope, preferenceId, generationId) { try { const result = await api('/api/evorin/feedback', { method: 'POST', body: JSON.stringify({ signal, scope, preferenceId, evidenceId: `${generationId}-${Date.now()}` }) }); await refresh(); toast(result.promoted ? 'Preference updated after repeated evidence.' : 'Signal saved. Two distinct examples make a preference reliable.'); } catch (error) { toast(error.message, 'error'); } }

function renderLibrary() {
  const examples = app.state.savedExamples.filter((item) => app.libraryFilter === 'all' || item.type === app.libraryFilter);
  $('#library-grid').innerHTML = examples.length ? examples.map((item) => `<article class="library-card"><div class="library-visual">${artFor(item.visual)}</div><div class="library-card-info"><div><b>${esc(item.title)}</b><small>${esc(item.subtitle)} · saved ${dateLabel(item.savedAt)}</small></div><span>♡</span></div></article>`).join('') : '<div class="empty-result"><strong>Nothing saved here yet.</strong><span>Save a look or content package and it will land in this library.</span></div>';
}

function preferenceMarkup(preference) { return `<article class="preference-row"><span>${preference.scope === 'styling' ? '✦' : '◒'}</span><div><b>${esc(preference.label)}</b><small>${esc(preference.value)} · ${esc(preference.source)}</small></div><div class="pref-meter"><i style="width:${Math.round(preference.strength * 100)}%"></i></div><button data-edit-preference="${esc(preference.id)}" title="Edit preference">···</button></article>`; }
function renderTaste() {
  const style = app.state.preferences.filter((item) => item.scope === 'styling'); const social = app.state.preferences.filter((item) => item.scope === 'social');
  $('#style-signal-count').textContent = `${style.length} signals`; $('#social-signal-count').textContent = `${social.length} signals`;
  $('#style-preferences').innerHTML = style.length ? style.map(preferenceMarkup).join('') : '<div class="empty-result"><strong>No style memory yet.</strong><span>It will grow as you choose and save.</span></div>';
  $('#social-preferences').innerHTML = social.length ? social.map(preferenceMarkup).join('') : '<div class="empty-result"><strong>No social memory yet.</strong><span>Approve a content package to start.</span></div>';
  $('#learning-log').innerHTML = app.state.activity.filter((item) => item.kind === 'learned').slice(0, 4).map((item) => `<div class="log-row"><span>✦</span><div><b>${esc(item.title)}</b><small>${esc(item.detail)} · ${esc(item.time)}</small></div></div>`).join('') || '<div class="log-row"><span>·</span><div><b>Your learning log is quiet.</b><small>Feedback becomes visible here.</small></div></div>';
  $$('[data-edit-preference]').forEach((button) => button.addEventListener('click', () => editPreference(button.dataset.editPreference)));
}

async function editPreference(id) { const preference = app.state.preferences.find((item) => item.id === id); if (!preference) return; const value = window.prompt(`Edit “${preference.label}”`, preference.value); if (!value || value === preference.value) return; try { await api(`/api/evorin/preferences/${id}`, { method: 'PATCH', body: JSON.stringify({ value }) }); await refresh(); toast('Your taste note was updated.'); } catch (error) { toast(error.message, 'error'); } }
async function resetTaste() { if (!window.confirm('Reset all learned taste? You can always teach Evorin again.')) return; try { await api('/api/evorin/preferences/reset', { method: 'POST', body: JSON.stringify({}) }); await refresh(); toast('Learned taste reset.'); } catch (error) { toast(error.message, 'error'); } }

async function refresh() { app.state = await api('/api/evorin/state'); renderHome(); renderLibrary(); renderTaste(); }

function bind() {
  document.addEventListener('click', (event) => { const trigger = event.target.closest('[data-view]'); if (trigger) setView(trigger.dataset.view); });
  $('#style-file').addEventListener('change', handleStyleFiles); $('#style-browse').addEventListener('click', () => $('#style-file').click()); $('#style-generate').addEventListener('click', generateStyle);
  $('#create-files').addEventListener('change', handleCreateFiles); $('#create-browse').addEventListener('click', () => $('#create-files').click()); $('#content-generate').addEventListener('click', generateContent);
  $$('#occasion-choices .choice').forEach((button) => button.addEventListener('click', () => { $$('#occasion-choices .choice').forEach((item) => item.classList.remove('active')); button.classList.add('active'); app.styleOccasion = button.dataset.occasion; }));
  $$('#format-options .format-option').forEach((button) => button.addEventListener('click', () => { $$('#format-options .format-option').forEach((item) => item.classList.remove('active')); button.classList.add('active'); app.createFormat = button.dataset.format; }));
  $$('.direction-options .direction').forEach((button) => button.addEventListener('click', () => { $$('.direction-options .direction').forEach((item) => item.classList.remove('active')); button.classList.add('active'); app.createDirection = button.dataset.direction; }));
  $$('[data-library-filter]').forEach((button) => button.addEventListener('click', () => { $$('[data-library-filter]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); app.libraryFilter = button.dataset.libraryFilter; renderLibrary(); }));
  $('#reset-taste').addEventListener('click', resetTaste);
  $('#notifications').addEventListener('click', () => toast('Evorin is private by default. Browser notifications will arrive when scheduled workflows are enabled.'));
}

async function init() { bind(); renderStyleResult(); renderContentResult(); try { await refresh(); } catch (error) { toast(error.message, 'error'); } }
init();

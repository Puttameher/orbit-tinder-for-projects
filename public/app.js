const preview = {
  direction: localStorage.getItem('orbit-preview-direction') || 'a',
  lensState: 'idle',
  approved: JSON.parse(localStorage.getItem('orbit-preview-state') || 'null'),
  dragSource: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));

const directionData = {
  a: {
    eyebrow: 'Direction A',
    title: 'The intelligence<br /><em>has a pulse.</em>',
    description: 'A night observatory for opportunity discovery. Orbit Lens feels like a small instrument you can bring closer to the work.',
    swatches: ['#111719', '#dfff64', '#ff907a', '#e6b353']
  },
  b: {
    eyebrow: 'Direction B',
    title: 'Precision<br /><em>with a point of view.</em>',
    description: 'A measured, editorial instrument. Orbit Lens becomes an intelligent artifact, folded from context, evidence, and a next action.',
    swatches: ['#1b1d2a', '#3a4fe3', '#ce7656', '#d1b45f']
  },
  c: {
    eyebrow: 'Direction C',
    title: 'A curious signal<br /><em>that stays human.</em>',
    description: 'A restrained organic companion for people who want the system to feel alive without becoming a mascot or a chat bubble.',
    swatches: ['#211a2d', '#c5ead8', '#f2aa79', '#d6c08c']
  }
};

function toast(message) {
  const node = document.createElement('div'); node.className = 'toast'; node.innerHTML = `<strong>Orbit</strong>${esc(message)}`; $('#toast-region').append(node); window.setTimeout(() => node.remove(), 4000);
}

function scrollToTarget(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

function setDirection(direction, announce = true) {
  preview.direction = direction; localStorage.setItem('orbit-preview-direction', direction); document.body.className = `direction-${direction}`;
  $$('.direction-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.direction === direction));
  const data = directionData[direction]; $('#direction-eyebrow').textContent = data.eyebrow; $('#direction-title').innerHTML = data.title; $('#direction-description').textContent = data.description;
  $('#direction-swatches').innerHTML = data.swatches.map((color) => `<i style="background:${color}"></i>`).join(''); $('#approval-direction').value = direction;
  if (announce) toast(`${data.eyebrow} selected for review.`);
}

function setLensState(state) {
  preview.lensState = state; const dock = $('#lens-dock'); const label = $('#dock-label'); dock.classList.toggle('active', ['engaged', 'insight', 'complete'].includes(state)); dock.classList.toggle('analyzing', state === 'analyzing');
  const labels = { idle: 'idle · ready to inspect', engaged: 'engaged · context acquired', analyzing: 'analyzing · mapping the fit', insight: 'insight · ready to inspect', complete: 'complete · next move available' }; label.textContent = labels[state];
}

function renderAnalysis() {
  $('#analysis-panel').innerHTML = `<div class="analysis-content"><small>Orbit Lens · illustrative analysis</small><h3>Campus Pantry</h3><p>A dignity-first logistics layer for students. The opportunity is early, concrete, and close to your product-design interests.</p><div class="analysis-score"><div><b>84%</b><span>readiness estimate</span></div><span>not a live ML prediction</span></div><div class="analysis-list"><div><i>+</i><span>Shared interest: education and civic tech</span></div><div><i>+</i><span>Weekend commitment fits your stated availability</span></div><div><i>!</i><span>Backend ownership is the missing capability</span></div></div><div class="analysis-next"><b>Next action:</b> review the open role and ask what the first milestone needs.</div></div>`;
}

function runAnalysis(source = 'button') {
  if (preview.lensState === 'analyzing') return;
  setLensState('engaged'); if (source === 'drag') { $('#opportunity-card').classList.add('dragging'); window.setTimeout(() => $('#opportunity-card').classList.remove('dragging'), 400); }
  window.setTimeout(() => setLensState('analyzing'), 350); window.setTimeout(() => { setLensState('insight'); renderAnalysis(); toast('Lens found an overlap, a gap, and a next action.'); }, 1450);
}

function setupDrag() {
  const card = $('#opportunity-card'); const heroCard = $('#hero-project'); const targets = $$('[data-lens]');
  [card, heroCard].forEach((source) => { source.addEventListener('dragstart', (event) => { preview.dragSource = source; source.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; }); source.addEventListener('dragend', () => source.classList.remove('dragging')); });
  targets.forEach((target) => { target.addEventListener('dragover', (event) => { event.preventDefault(); target.classList.add('active'); }); target.addEventListener('dragleave', () => target.classList.remove('active')); target.addEventListener('drop', (event) => { event.preventDefault(); target.classList.remove('active'); runAnalysis('drag'); }); });
}

function saveApproval(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const direction = $('#approval-direction').value; const state = { approved: true, direction, keep: { lens: form.get('keepLens') === 'on', card: form.get('keepCard') === 'on', motion: form.get('keepMotion') === 'on' }, notes: $('#approval-notes').value.trim(), approvedAt: new Date().toISOString() };
  preview.approved = state; localStorage.setItem('orbit-preview-state', JSON.stringify(state)); const status = $('#approval-status'); status.textContent = `Approved ${direction.toUpperCase()} on ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date())}. Production remains paused until this approval is reviewed in the project chat.`; status.classList.add('approved'); toast('Direction recorded. Production is still paused for owner review.');
}

function restoreApproval() {
  if (!preview.approved) return; const approval = preview.approved; $('#approval-direction').value = approval.direction; $$('[name^="keep"]').forEach((input) => { const key = input.name.replace('keep', '').toLowerCase(); if (approval.keep?.[key] !== undefined) input.checked = approval.keep[key]; }); $('#approval-notes').value = approval.notes || ''; const status = $('#approval-status'); status.textContent = `Previously approved ${approval.direction.toUpperCase()} in this browser. Submit again to update your review.`; status.classList.add('approved');
}

function bind() {
  $$('[data-scroll]').forEach((button) => button.addEventListener('click', () => scrollToTarget(button.dataset.scroll)));
  $$('.direction-tab').forEach((tab) => tab.addEventListener('click', () => setDirection(tab.dataset.direction)));
  $('#approval-direction').addEventListener('change', (event) => setDirection(event.target.value, false));
  $('#analyze-button').addEventListener('click', () => runAnalysis()); $('#lens-dock').addEventListener('click', () => runAnalysis('tap'));
  $('#hero-project').addEventListener('click', () => { scrollToTarget('lens'); window.setTimeout(() => runAnalysis('tap'), 500); });
  $('#approval-form').addEventListener('submit', saveApproval); setupDrag(); restoreApproval(); setDirection(preview.direction, false);
  $('#menu-button').addEventListener('click', () => { $('.nav-links').classList.toggle('open'); $('.nav-links').classList.toggle('mobile-open'); });
}

bind();

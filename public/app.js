const preview = {
  direction: localStorage.getItem('orbit-preview-direction-v2') || 'b',
  lensState: 'idle',
  approved: JSON.parse(localStorage.getItem('orbit-preview-state') || 'null'),
  dragSource: null
};
let orbitState = null;

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

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || result.error || result.message || 'Orbit request failed.');
  return result;
}

async function loadOrbitState() {
  try {
    orbitState = await api('/api/orbit/state');
    const first = orbitState.discover?.[0];
    if (first) {
      orbitState.currentOpportunityId = first.id;
      const titleNodes = [document.querySelector('.opportunity-body h3'), document.querySelector('.app-deck-copy h4')].filter(Boolean);
      titleNodes.forEach((node) => { node.textContent = first.title; });
      const summaryNodes = [document.querySelector('.opportunity-body p'), document.querySelector('.app-deck-copy p')].filter(Boolean);
      summaryNodes.forEach((node) => { node.textContent = first.summary; });
    }
  } catch (error) {
    toast('Preview mode is active. Functional Orbit API is temporarily unavailable.');
  }
}

function setDirection(direction, announce = true) {
  preview.direction = direction; localStorage.setItem('orbit-preview-direction-v2', direction); document.body.className = `direction-${direction}`;
  $$('.direction-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.direction === direction));
  const data = directionData[direction]; $('#direction-eyebrow').textContent = data.eyebrow; $('#direction-title').innerHTML = data.title; $('#direction-description').textContent = data.description;
  $('#direction-swatches').innerHTML = data.swatches.map((color) => `<i style="background:${color}"></i>`).join(''); $('#approval-direction').value = direction;
  if (announce) toast(`${data.eyebrow} selected for review.`);
}

function setLensState(state) {
  preview.lensState = state; const dock = $('#lens-dock'); const label = $('#dock-label'); dock.classList.toggle('active', ['engaged', 'insight', 'complete'].includes(state)); dock.classList.toggle('analyzing', state === 'analyzing');
  const labels = { idle: 'idle · ready to inspect', engaged: 'engaged · context acquired', analyzing: 'analyzing · mapping the fit', insight: 'insight · ready to inspect', complete: 'complete · next move available' }; label.textContent = labels[state];
}

function renderAnalysis(run) {
  const fit = run?.fit;
  const opportunity = orbitState?.discover?.find((item) => item.id === orbitState.currentOpportunityId) || { title: 'Campus Pantry', summary: 'A dignity-first logistics layer for students.' };
  const score = fit?.score ?? 84;
  const strengths = fit?.strengths?.slice(0, 2) || ['Shared purpose in education and civic tech', 'Weekend availability appears workable'];
  const gap = fit?.gaps?.[0] || 'Backend ownership is the missing capability';
  const next = run?.nextActions?.actions?.find((action) => action.type === 'verify' || action.type === 'clarify')?.title || 'Review the open role and ask what the first milestone needs.';
  $('#analysis-panel').innerHTML = `<div class="analysis-content"><small>Orbit Lens · transparent agent analysis</small><h3>${esc(opportunity.title)}</h3><p>${esc(opportunity.summary)}</p><div class="analysis-score"><div><b>${score}%</b><span>declared fit score</span></div><span>${fit ? 'functional baseline' : 'preview fallback'}</span></div><div class="analysis-list"><div><i>+</i><span>${esc(strengths[0])}</span></div><div><i>+</i><span>${esc(strengths[1] || 'Opportunity stage is visible')}</span></div><div><i>!</i><span>${esc(gap)}</span></div></div><div class="analysis-next"><b>Next action:</b> ${esc(next)}</div></div>`;
}

async function runAnalysis(source = 'button') {
  if (preview.lensState === 'analyzing') return;
  setLensState('engaged'); if (source === 'drag') { $('#opportunity-card').classList.add('dragging'); window.setTimeout(() => $('#opportunity-card').classList.remove('dragging'), 400); }
  window.setTimeout(() => setLensState('analyzing'), 350); window.setTimeout(async () => { let run = null; try { if (orbitState?.currentOpportunityId) run = await api(`/api/orbit/opportunities/${orbitState.currentOpportunityId}/analyze`, { method: 'POST', body: '{}' }); } catch { /* preview fallback remains useful offline */ } setLensState('insight'); renderAnalysis(run); toast(run ? 'Lens found an overlap, a gap, and a next action.' : 'Lens preview completed with local sample data.'); }, 1450);
}

function setupDrag() {
  const card = $('#opportunity-card'); const heroCard = $('#hero-project'); const appCard = $('#app-deck-card'); const targets = $$('[data-lens]');
  [card, heroCard, appCard].filter(Boolean).forEach((source) => { source.addEventListener('dragstart', (event) => { preview.dragSource = source; source.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; }); source.addEventListener('dragend', () => source.classList.remove('dragging')); });
  targets.forEach((target) => { target.addEventListener('dragover', (event) => { event.preventDefault(); target.classList.add('active'); }); target.addEventListener('dragleave', () => target.classList.remove('active')); target.addEventListener('drop', (event) => { event.preventDefault(); target.classList.remove('active'); runAnalysis('drag'); }); });
}

function initMotionStudy() {
  const canvas = $('#dash-video'); if (!canvas) return;
  const context = canvas.getContext('2d'); let frame = 0;
  const resize = () => { const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = Math.max(1, rect.width * ratio); canvas.height = Math.max(1, rect.height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); };
  const draw = () => { const width = canvas.clientWidth; const height = canvas.clientHeight; if (!width || !height) return; frame += 0.012; context.clearRect(0, 0, width, height); const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#171b36'); gradient.addColorStop(.5, '#3a4fe3'); gradient.addColorStop(1, '#ce7656'); context.fillStyle = gradient; context.fillRect(0, 0, width, height); for (let index = 0; index < 8; index += 1) { const x = width * (.18 + index * .11) + Math.sin(frame * 2 + index) * 25; const y = height * (.55 + Math.cos(frame * 1.4 + index * .7) * .24); const radius = 28 + Math.sin(frame * 2.5 + index) * 8; const bubble = context.createRadialGradient(x - radius * .25, y - radius * .25, 2, x, y, radius); bubble.addColorStop(0, 'rgba(238,249,255,.95)'); bubble.addColorStop(.42, 'rgba(180,223,255,.32)'); bubble.addColorStop(1, 'rgba(180,223,255,0)'); context.fillStyle = bubble; context.beginPath(); context.ellipse(x, y, radius * 1.45, radius * .7, Math.sin(index + frame) * .3, 0, Math.PI * 2); context.fill(); } context.strokeStyle = 'rgba(255,255,255,.4)'; context.lineWidth = 1; context.beginPath(); context.arc(width * .66, height * .36, 46 + Math.sin(frame) * 6, frame, frame + Math.PI * 1.5); context.stroke(); window.requestAnimationFrame(draw); };
  resize(); window.addEventListener('resize', resize); draw();
}

function bindAppDeck() {
  const card = $('#app-deck-card'); if (!card) return;
  const swipe = async (direction) => { card.classList.remove('app-swipe-left', 'app-swipe-right', 'app-saved'); if (direction === 'save') card.classList.add('app-saved'); else card.classList.add(direction === 'left' ? 'app-swipe-left' : 'app-swipe-right'); try { if (orbitState?.currentOpportunityId) { const decision = direction === 'left' ? 'pass' : direction === 'save' ? 'save' : 'like'; const result = await api('/api/orbit/swipe', { method: 'POST', body: JSON.stringify({ projectId: orbitState.currentOpportunityId, decision }) }); toast(result.match ? 'Mutual interest found. Match created.' : decision === 'save' ? 'Saved to your Orbit shortlist.' : 'Signal recorded.'); await loadOrbitState(); } } catch (error) { toast(error.message); } window.setTimeout(() => { card.classList.remove('app-swipe-left', 'app-swipe-right', 'app-saved'); }, 620); };
  $('#app-pass')?.addEventListener('click', () => swipe('left')); $('#app-save')?.addEventListener('click', () => swipe('save')); $('#app-like')?.addEventListener('click', () => swipe('right'));
}

function bindScrollMotion() {
  const sections = $$('main > section'); sections.forEach((section) => section.classList.add('reveal-section')); if (!('IntersectionObserver' in window)) { sections.forEach((section) => section.classList.add('is-visible')); return; }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .12 }); sections.forEach((section) => observer.observe(section));
}

function saveApproval(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const direction = $('#approval-direction').value; const state = { approved: true, direction, keep: { lens: form.get('keepLens') === 'on', card: form.get('keepCard') === 'on', motion: form.get('keepMotion') === 'on' }, notes: $('#approval-notes').value.trim(), approvedAt: new Date().toISOString() };
  preview.approved = state; localStorage.setItem('orbit-preview-state', JSON.stringify(state)); const status = $('#approval-status'); status.textContent = `Approved ${direction.toUpperCase()} on ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date())}. This direction is now the active Orbit product theme.`; status.classList.add('approved'); toast('Direction recorded. Orbit is ready for the functional build.');
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
  $('#approval-form').addEventListener('submit', saveApproval); setupDrag(); bindAppDeck(); bindScrollMotion(); initMotionStudy(); restoreApproval(); setDirection(preview.direction, false);
  $('#menu-button').addEventListener('click', () => { $('.nav-links').classList.toggle('open'); $('.nav-links').classList.toggle('mobile-open'); });
}

bind();
loadOrbitState();

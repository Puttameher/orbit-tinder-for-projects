import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('main Orbit shell exposes the cosmic deck, categories, composer, and AI controls', async () => {
  const html = await readFile(path.join(root, 'public', 'app.html'), 'utf8');
  const script = await readFile(path.join(root, 'public', 'app-shell.js'), 'utf8');
  const css = await readFile(path.join(root, 'public', 'app-shell.css'), 'utf8');

  for (const marker of ['Orbit<sup>+</sup>', 'Open-source AI Research Assistant', 'Orbit LENS', 'project-match-score', 'Research papers', 'Projects', 'Open source', 'project-card', 'maybe-button', 'composer-overlay', 'opportunity-form']) {
    assert.ok(html.includes(marker), `missing shell marker: ${marker}`);
  }
  for (const marker of ['/api/orbit/opportunities', 'bindPointerSwipe', 'createOpportunity', 'analyze']) {
    assert.ok(script.includes(marker), `missing behavior marker: ${marker}`);
  }
  for (const marker of ['.app-sidebar', '.deck-stack', '.swipe-control', '.composer-overlay', 'prefers-reduced-motion']) {
    assert.ok(css.includes(marker), `missing style marker: ${marker}`);
  }
});

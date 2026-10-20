import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 43000 + (process.pid % 1000);
let tempDir;
let child;

async function waitForServer() {
  const url = `http://127.0.0.1:${port}/api/orbit/categories`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Orbit API did not start in time.');
}

async function request(route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return { response, body: await response.json() };
}

test.before(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-api-'));
  await copyFile(path.join(root, 'data', 'rally-seed.json'), path.join(tempDir, 'rally-seed.json'));
  child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ORBIT_DATA_DIR: tempDir },
    stdio: 'ignore'
  });
  await waitForServer();
});

test.after(async () => {
  child?.kill();
  await rm(tempDir, { recursive: true, force: true });
});

test('category endpoints and filtering return canonical catalog slices', async () => {
  const state = await request('/api/orbit/state');
  assert.equal(state.response.status, 200);
  const reference = state.body.discover.find((item) => item.id === 'project-arxiv-labs');
  assert.ok(reference);
  assert.equal(reference.title, 'Open-source AI Research Assistant');
  assert.equal(reference.category, 'research-papers');
  assert.deepEqual(reference.stack, ['Python', 'RAG', 'Embeddings', 'LLMs']);
  assert.equal(reference.owner.name, 'arxiv-labs');

  const categories = await request('/api/orbit/categories');
  assert.equal(categories.response.status, 200);
  assert.deepEqual(categories.body.categories.map((item) => item.id), ['research-papers', 'projects', 'open-source']);

  const filtered = await request('/api/orbit/opportunities?category=open%20source');
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.category, 'open-source');
  assert.ok(filtered.body.opportunities.length > 0);
  assert.ok(filtered.body.opportunities.every((item) => item.category === 'open-source'));

  const invalid = await request('/api/orbit/opportunities?category=unknown');
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_CATEGORY');
});

test('user-created opportunities validate, persist, and receive local AI-style analysis', async () => {
  const created = await request('/api/orbit/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Local climate paper reading group',
      summary: 'A collaboration around a public climate research paper.',
      category: 'research-papers',
      needs: ['research partner'],
      commitment: '2 hrs / week'
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.opportunity.category, 'research-papers');
  assert.equal(created.body.opportunity.createdBy, 'local-user');
  const id = created.body.opportunity.id;

  const persisted = JSON.parse(await readFile(path.join(tempDir, 'rally-state.json'), 'utf8'));
  assert.ok(persisted.projects.some((item) => item.id === id && item.createdBy === 'local-user'));

  const summary = await request(`/api/orbit/opportunities/${encodeURIComponent(id)}/summary`);
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.summary.provider, 'local');
  assert.equal(summary.body.summary.offlineSafe, true);
  assert.equal(summary.body.summary.fitScore, summary.body.fit.score);

  const analysis = await request(`/api/orbit/opportunities/${encodeURIComponent(id)}/analyze`, { method: 'POST', body: '{}' });
  assert.equal(analysis.response.status, 200);
  assert.equal(analysis.body.summary.method, 'deterministic-template-v1');
  assert.equal(analysis.body.offlineSafe, true);
});

test('creating an opportunity rejects invalid objects consistently', async () => {
  const invalid = await request('/api/orbit/opportunities', { method: 'POST', body: JSON.stringify({ category: 'not-a-category' }) });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_OPPORTUNITY');
  assert.ok(Array.isArray(invalid.body.error.fields));
});

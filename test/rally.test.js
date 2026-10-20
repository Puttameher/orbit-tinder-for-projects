import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemixPlan, draftIntroduction, explainProjectFit, scoreProject } from '../lib/rally.js';

const user = { interests: ['education', 'creative tools'], skills: ['react', 'product design'], availability: 'weekends' };
const project = { id: 'p1', title: 'Campus Pantry', summary: 'Food access', stage: 'prototype', tags: ['education', 'civic tech'], needs: ['product designer'], stack: ['Next.js'], commitment: '2–3 hrs / week', owner: { name: 'Maya Rao' } };

test('fit score is transparent and bounded', () => {
  const score = scoreProject(project, user);
  assert.ok(score.score >= 0 && score.score <= 100);
  assert.equal(score.interestHits, 1);
  assert.equal(score.skillHits, 1);
});

test('fit explanation cites strengths, tradeoffs, and visible evidence', () => {
  const fit = explainProjectFit(project, user);
  assert.equal(fit.strengths.length, 3);
  assert.equal(fit.tradeoffs.length, 2);
  assert.equal(fit.evidence[0].label, 'interests');
});

test('remix creates a separate, reversible plan', () => {
  const remix = createRemixPlan(project, user);
  assert.equal(remix.sourceProjectId, 'p1');
  assert.equal(remix.status, 'draft');
  assert.match(remix.firstMilestone, /7-day/);
});

test('introduction is a draft and never a send action', () => {
  const draft = draftIntroduction(project, { strengths: ['shared purpose'] }, user);
  assert.match(draft, /Campus Pantry/);
  assert.match(draft, /shared purpose/);
});

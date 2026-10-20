import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANKING_METHOD,
  RANKING_WEIGHTS,
  createIntroductionDraft,
  createRemixPlan,
  explainFit,
  filterOpportunitiesByCategory,
  getOpportunityCategory,
  normalizeOpportunity,
  normalizeProfile,
  planNextActions,
  rankOpportunities,
  scoreOpportunity,
  summarizeOpportunity,
  validateOpportunity,
  validateProfile
} from '../lib/orbit-domain.js';

const profileInput = {
  id: 'person-1',
  name: 'Maya Rao',
  interests: ['Education', 'creative tools', 'education'],
  skills: ['React', 'product design'],
  availability: '2-3 hrs / week on weekends',
  preferredStages: ['prototype'],
  timezone: 'Asia/Kolkata'
};

const opportunityInput = {
  id: 'op-1',
  title: 'Campus Pantry',
  summary: 'A calm tool for improving food access on campus.',
  stage: 'MVP',
  tags: ['education', 'civic tech'],
  needs: ['product designer', 'community research'],
  stack: ['React'],
  commitment: '2 hrs / week',
  owner: { id: 'owner-1', name: 'Maya Menon', email: 'maya@example.test' },
  provenance: { provider: 'community-board', id: 'listing-9', url: 'https://example.test/op-1', observedAt: '2026-10-19T10:00:00Z' }
};

test('profile validation normalizes declared lists and availability', () => {
  const result = validateProfile(profileInput);
  assert.equal(result.ok, true);
  assert.deepEqual(result.interests, ['Education', 'creative tools']);
  assert.deepEqual(result.skills, ['React', 'product design']);
  assert.equal(result.availability.minHoursPerWeek, 2);
  assert.equal(result.availability.maxHoursPerWeek, 3);
  assert.deepEqual(normalizeProfile(profileInput).preferredStages, ['prototype']);
  assert.equal(validateProfile({ interests: ['education'] }).ok, false);
});

test('opportunity normalization keeps source provenance and canonical stage', () => {
  const opportunity = normalizeOpportunity(opportunityInput);
  assert.equal(opportunity.stage, 'prototype');
  assert.equal(opportunity.provenance.provider, 'community-board');
  assert.equal(opportunity.provenance.sourceId, 'listing-9');
  assert.equal(opportunity.provenance.url, 'https://example.test/op-1');
  assert.equal(opportunity.commitmentHours.maxHoursPerWeek, 2);
});

test('opportunity categories are deterministic and filterable', () => {
  const research = { id: 'paper-1', title: 'Climate research paper', summary: 'A study of local heat data.' };
  const openSource = { id: 'oss-1', title: 'A contributor tool', license: 'open source' };
  const project = { id: 'project-1', title: 'A neighborhood project', summary: 'A small collaboration.' };
  assert.equal(getOpportunityCategory(research), 'research-papers');
  assert.equal(getOpportunityCategory(openSource), 'open-source');
  assert.equal(getOpportunityCategory(project), 'projects');
  assert.deepEqual(filterOpportunitiesByCategory([research, openSource, project], 'research'), [research]);
  assert.equal(normalizeOpportunity(research).category, 'research-papers');
});

test('opportunity validation rejects unsupported category values', () => {
  assert.equal(validateOpportunity({ title: 'A project', summary: 'Context', category: 3 }).ok, false);
});

test('ranking is bounded, stable, and exposes the five weighted feature contributions', () => {
  const ranking = scoreOpportunity(opportunityInput, profileInput, { asOf: '2026-10-20T10:00:00Z' });
  assert.equal(ranking.method, RANKING_METHOD);
  assert.ok(ranking.score >= 0 && ranking.score <= 100);
  assert.deepEqual(Object.keys(ranking.featureBreakdown), ['interest', 'skill', 'availability', 'freshness', 'stage']);
  assert.equal(Object.values(RANKING_WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1);
  assert.ok(ranking.featureBreakdown.interest.matches.includes('Education'));
  assert.ok(ranking.featureBreakdown.skill.contribution > 0);
  assert.equal(rankOpportunities([opportunityInput], profileInput, { asOf: '2026-10-20T10:00:00Z' })[0].rank, 1);
});

test('fit explanation is bounded and cites strengths, gaps, tradeoffs, and evidence', () => {
  const fit = explainFit(opportunityInput, profileInput, { asOf: '2026-10-20T10:00:00Z', maxItems: 2, maxEvidence: 6 });
  assert.ok(fit.strengths.length <= 2);
  assert.ok(fit.gaps.length <= 2);
  assert.ok(fit.tradeoffs.length <= 2);
  assert.ok(fit.evidence.length <= 6);
  assert.ok(fit.confidence >= 0 && fit.confidence <= 1);
  assert.ok(fit.evidence.some((item) => item.feature === 'provenance'));
});

test('local opportunity summary is deterministic, transparent, and offline-safe', () => {
  const fit = explainFit(opportunityInput, profileInput, { asOf: '2026-10-20T10:00:00Z' });
  const first = summarizeOpportunity(opportunityInput, fit);
  const second = summarizeOpportunity(opportunityInput, fit);
  assert.deepEqual(first, second);
  assert.equal(first.provider, 'local');
  assert.equal(first.offlineSafe, true);
  assert.equal(first.draftOnly, true);
  assert.equal(first.fitScore, fit.score);
  assert.ok(first.evidence.length > 0);
});

test('next-action planning is proposal-only and includes the mutual-interest gate', () => {
  const plan = planNextActions(opportunityInput, profileInput, null, { asOf: '2026-10-20T10:00:00Z' });
  assert.equal(plan.status, 'draft');
  assert.equal(plan.sideEffect, 'none');
  assert.ok(plan.actions.some((item) => item.type === 'confirm'));
  assert.ok(plan.actions.every((item) => item.draftOnly && item.requiresApproval));
});

test('introduction and remix outputs are safe, separate drafts', () => {
  const fit = explainFit(opportunityInput, profileInput, { asOf: '2026-10-20T10:00:00Z' });
  const introduction = createIntroductionDraft(opportunityInput, fit, profileInput, { now: '2026-10-20T10:00:00Z' });
  const remix = createRemixPlan(opportunityInput, profileInput, { fit, now: '2026-10-20T10:00:00Z' });
  assert.equal(introduction.status, 'draft');
  assert.equal(introduction.sendable, false);
  assert.match(introduction.body, /Campus Pantry/);
  assert.equal(remix.status, 'draft');
  assert.equal(remix.draftOnly, true);
  assert.equal(remix.sourceOpportunityId, 'op-1');
  assert.match(remix.firstMilestone, /7-day/);
  assert.equal(remix.sourceTitle, opportunityInput.title);
});

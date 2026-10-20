import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINE_WEIGHTS,
  FEATURE_NAMES,
  MODEL_VERSION,
  buildFeatureVector,
  createEvaluationReport,
  ndcgAtK,
  precisionAtK,
  rankCandidates,
  summarizeDiversityCoverage
} from '../lib/orbit-eval.js';

const user = {
  interests: ['climate', 'education'],
  skills: ['javascript', 'research'],
  goals: ['public good'],
  preferredTypes: ['open source'],
  remote: true
};

const opportunities = [
  { id: 'climate-lab', title: 'Climate education lab', tags: ['climate', 'education'], requiredSkills: ['javascript'], type: 'open source', remote: true, category: 'research' },
  { id: 'music-tool', title: 'Music tools', tags: ['music'], requiredSkills: ['rust'], type: 'startup', remote: false, category: 'product' },
  { id: 'civic-school', title: 'Civic school', tags: ['education'], requiredSkills: ['research'], type: 'open source', remote: true, category: 'research' }
];

test('feature vectors are fixed-order, bounded, and deterministic', () => {
  const first = buildFeatureVector(user, opportunities[0]);
  const second = buildFeatureVector(user, opportunities[0]);
  assert.deepEqual(first, second);
  assert.equal(first.length, FEATURE_NAMES.length);
  assert.ok(first.every((value) => value >= 0 && value <= 1));
  assert.equal(first[FEATURE_NAMES.indexOf('skillOverlap')], 0.5);
});

test('baseline ranking is transparent and stable on ties', () => {
  const ranked = rankCandidates(user, opportunities);
  assert.equal(ranked[0].id, 'climate-lab');
  assert.equal(ranked[0].modelVersion, MODEL_VERSION);
  assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3]);
  assert.equal(Object.keys(ranked[0].features).length, FEATURE_NAMES.length);
  assert.equal(Object.values(BASELINE_WEIGHTS).reduce((sum, value) => sum + value, 0), 1);
});

test('NDCG and precision use graded relevance at K', () => {
  const ranked = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const relevance = { a: 3, b: 0, c: 2 };
  assert.equal(ndcgAtK(ranked, relevance, 2), 0.787155);
  assert.equal(precisionAtK(ranked, relevance, 2), 0.5);
});

test('diversity and coverage summarize the recommended slice', () => {
  const ranked = rankCandidates(user, opportunities);
  const summary = summarizeDiversityCoverage(ranked, opportunities, 2);
  assert.equal(summary.recommendedCount, 2);
  assert.equal(summary.coverage.opportunities.total, 3);
  assert.equal(summary.coverage.categories.recommended, 1);
  assert.ok(summary.intraListDiversity >= 0 && summary.intraListDiversity <= 1);
});

test('evaluation report is explicitly baseline and JSON serializable', () => {
  const report = createEvaluationReport({
    k: 2,
    cases: [{ id: 'offline-1', user, opportunities, relevantIds: ['climate-lab', 'civic-school'] }]
  });
  assert.equal(report.baseline, true);
  assert.equal(report.trainedModel, false);
  assert.equal(report.model.version, MODEL_VERSION);
  assert.doesNotThrow(() => JSON.stringify(report));
  assert.equal(report.caseCount, 1);
  assert.ok(report.summary.ndcgAtK >= 0 && report.summary.ndcgAtK <= 1);
});

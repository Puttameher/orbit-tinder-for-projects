/**
 * Orbit offline ranking/evaluation primitives.
 *
 * This is an intentionally transparent baseline, not trained ML. It uses a
 * fixed feature vector and hand-written weights so experiments are
 * reproducible before a learned ranker is introduced.
 */

export const FEATURE_NAMES = Object.freeze([
  'interestOverlap',
  'skillOverlap',
  'goalOverlap',
  'typeMatch',
  'locationMatch',
  'availabilityMatch',
  'remoteMatch',
  'textAffinity',
  'qualitySignal',
  'freshnessSignal'
]);

export const BASELINE_WEIGHTS = Object.freeze({
  interestOverlap: 0.2,
  skillOverlap: 0.26,
  goalOverlap: 0.14,
  typeMatch: 0.08,
  locationMatch: 0.05,
  availabilityMatch: 0.06,
  remoteMatch: 0.04,
  textAffinity: 0.08,
  qualitySignal: 0.05,
  freshnessSignal: 0.04
});

export const MODEL_VERSION = 'orbit-transparent-baseline-v1';

const MODEL_METADATA = Object.freeze({
  name: 'Orbit transparent ranking baseline',
  version: MODEL_VERSION,
  kind: 'heuristic-baseline',
  trained: false,
  description: 'Deterministic hand-weighted feature baseline; not trained ML.',
  featureNames: FEATURE_NAMES,
  weights: BASELINE_WEIGHTS
});

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  if (Array.isArray(value)) return value.flatMap((item) => list(item));
  if (typeof value === 'string') return value.split(/[,;|]/).map(clean).filter(Boolean);
  return clean(value) ? [clean(value)] : [];
}

function tokenSet(values) {
  return new Set(list(values).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function overlap(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let matches = 0;
  for (const token of a) if (b.has(token)) matches += 1;
  return matches / a.size;
}

function anyValue(object, keys) {
  return keys.flatMap((key) => list(object?.[key]));
}

function opportunityText(opportunity) {
  return [
    opportunity?.title,
    opportunity?.name,
    opportunity?.summary,
    opportunity?.description,
    ...anyValue(opportunity, ['tags', 'category', 'type', 'skills', 'requiredSkills', 'needs', 'stack'])
  ].filter(Boolean).join(' ');
}

function userText(user) {
  return [
    ...anyValue(user, ['interests', 'skills', 'goals', 'preferredTypes', 'desiredTypes']),
    user?.bio,
    user?.summary
  ].filter(Boolean).join(' ');
}

function boolValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return ['true', 'yes', 'remote', 'hybrid', 'any'].includes(clean(value).toLowerCase());
}

function matchSignal(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  for (const token of a) if (b.has(token)) return 1;
  return 0;
}

function numericSignal(value, fallback = 0.5) {
  return Number.isFinite(value) ? clamp(value > 1 ? value / 100 : value) : fallback;
}

/**
 * Construct the fixed-order numeric vector used by the baseline ranker.
 * `options.referenceDate` is optional and makes date-based freshness explicit;
 * without it freshness is the neutral value, keeping this function pure.
 */
export function buildFeatureVector(user = {}, opportunity = {}, options = {}) {
  const userInterests = anyValue(user, ['interests', 'topics']);
  const userSkills = anyValue(user, ['skills', 'skillSet']);
  const userGoals = anyValue(user, ['goals', 'objectives', 'preferredDomains']);
  const opportunityTags = anyValue(opportunity, ['tags', 'topics', 'category', 'type']);
  const opportunitySkills = anyValue(opportunity, ['skills', 'requiredSkills', 'needs', 'stack']);
  const opportunityTypes = anyValue(opportunity, ['type', 'category', 'kind']);
  const opportunityLocations = anyValue(opportunity, ['location', 'locations', 'city', 'country']);
  const userLocations = anyValue(user, ['location', 'locations', 'city', 'country']);
  const userTypes = anyValue(user, ['preferredTypes', 'desiredTypes', 'opportunityTypes', 'types']);
  const userAvailability = anyValue(user, ['availability', 'commitment', 'timeAvailability']);
  const opportunityAvailability = anyValue(opportunity, ['availability', 'commitment', 'timeCommitment']);
  const userRemote = user.remote ?? user.remotePreference ?? user.workMode;
  const opportunityRemote = opportunity.remote ?? opportunity.remoteFriendly ?? opportunity.workMode;

  let freshness = numericSignal(opportunity.freshnessScore, 0.5);
  const referenceTime = Date.parse(options.referenceDate || '');
  const postedTime = Date.parse(opportunity.postedAt || opportunity.createdAt || '');
  if (Number.isFinite(referenceTime) && Number.isFinite(postedTime)) {
    const ageDays = Math.max(0, referenceTime - postedTime) / (24 * 60 * 60 * 1000);
    freshness = clamp(1 - ageDays / 365);
  }

  const vector = [
    overlap(userInterests, opportunityTags),
    overlap(userSkills, opportunitySkills),
    overlap(userGoals, opportunityTags),
    matchSignal(userTypes, opportunityTypes),
    matchSignal(userLocations, opportunityLocations),
    matchSignal(userAvailability, opportunityAvailability),
    (userRemote === undefined || userRemote === null || userRemote === '') ? 0.5 : (boolValue(userRemote) === boolValue(opportunityRemote) ? 1 : 0),
    overlap(userText(user), opportunityText(opportunity)),
    numericSignal(opportunity.qualityScore ?? opportunity.quality ?? opportunity.reputationScore),
    freshness
  ];
  return vector.map((value) => Number(clamp(value).toFixed(6)));
}

export const constructFeatureVector = buildFeatureVector;

export function featureVectorToObject(vector) {
  if (!Array.isArray(vector) || vector.length !== FEATURE_NAMES.length) {
    throw new TypeError(`Feature vector must contain exactly ${FEATURE_NAMES.length} numbers.`);
  }
  return Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, Number(clamp(Number(vector[index]) || 0).toFixed(6))]));
}

export function getModelVersionMetadata() {
  return {
    ...MODEL_METADATA,
    featureNames: [...MODEL_METADATA.featureNames],
    weights: { ...MODEL_METADATA.weights }
  };
}

export const modelVersionMetadata = getModelVersionMetadata;

function candidateId(candidate, index) {
  return clean(candidate?.id || candidate?.opportunityId || candidate?.slug) || `candidate-${index + 1}`;
}

function scoreVector(vector) {
  const features = featureVectorToObject(vector);
  return Number(FEATURE_NAMES.reduce((sum, name) => sum + features[name] * BASELINE_WEIGHTS[name], 0).toFixed(6));
}

export function scoreCandidate(user, opportunity, options = {}) {
  const featureVector = buildFeatureVector(user, opportunity, options);
  return {
    score: scoreVector(featureVector),
    featureVector,
    features: featureVectorToObject(featureVector),
    modelVersion: MODEL_VERSION
  };
}

/** Rank a user's opportunities using only the deterministic baseline score. */
export function rankCandidates(user = {}, opportunities = [], options = {}) {
  if (!Array.isArray(opportunities)) throw new TypeError('opportunities must be an array.');
  return opportunities.map((opportunity, index) => {
    const scored = scoreCandidate(user, opportunity || {}, options);
    return {
      id: candidateId(opportunity, index),
      rank: 0,
      opportunity: opportunity || {},
      ...scored,
      _inputIndex: index
    };
  }).sort((left, right) => right.score - left.score || left._inputIndex - right._inputIndex || left.id.localeCompare(right.id))
    .map(({ _inputIndex, ...entry }, index) => ({ ...entry, rank: index + 1 }));
}

export const rankOpportunities = rankCandidates;
export const rankUserOpportunities = rankCandidates;

function validateK(k, length) {
  const value = k === undefined ? length : k;
  if (!Number.isInteger(value) || value < 0) throw new RangeError('k must be a non-negative integer.');
  return Math.min(value, length);
}

function itemId(item, index) {
  return clean(item?.id || item?.opportunity?.id || item?.candidate?.id) || `candidate-${index + 1}`;
}

function relevanceValue(relevance, item, index) {
  if (typeof relevance === 'function') return Number(relevance(item, index)) || 0;
  if (relevance instanceof Set) return relevance.has(itemId(item, index)) ? 1 : 0;
  if (Array.isArray(relevance)) {
    if (relevance.every((value) => typeof value === 'number')) return Number(relevance[index]) || 0;
    const match = relevance.find((value) => (typeof value === 'string' ? value === itemId(item, index) : value?.id === itemId(item, index)));
    return typeof match === 'string' ? 1 : Number(match?.relevance ?? match?.label ?? match?.grade) || 0;
  }
  if (isObject(relevance)) {
    const value = relevance[itemId(item, index)];
    return Number(value?.relevance ?? value?.label ?? value?.grade ?? value) || 0;
  }
  return Number(item?.relevance ?? item?.label ?? item?.grade) || 0;
}

function allRelevanceValues(relevance, ranked) {
  if (Array.isArray(relevance) && relevance.every((value) => typeof value === 'number')) return relevance.map(Number);
  if (isObject(relevance)) return Object.values(relevance).map((value) => Number(value?.relevance ?? value?.label ?? value?.grade ?? value) || 0);
  return ranked.map((item, index) => relevanceValue(relevance, item, index));
}

export function ndcgAtK(ranked = [], relevance = undefined, k = 10) {
  if (!Array.isArray(ranked)) throw new TypeError('ranked must be an array.');
  const limit = validateK(k, ranked.length);
  if (!limit) return 0;
  const actual = ranked.slice(0, limit).reduce((sum, item, index) => {
    const gain = Math.pow(2, Math.max(0, relevanceValue(relevance, item, index))) - 1;
    return sum + gain / Math.log2(index + 2);
  }, 0);
  const ideal = allRelevanceValues(relevance, ranked).sort((left, right) => right - left).slice(0, limit)
    .reduce((sum, value, index) => sum + (Math.pow(2, Math.max(0, value)) - 1) / Math.log2(index + 2), 0);
  return ideal ? Number((actual / ideal).toFixed(6)) : 0;
}

export const ndcg = ndcgAtK;

export function precisionAtK(ranked = [], relevance = undefined, k = 10, options = {}) {
  if (!Array.isArray(ranked)) throw new TypeError('ranked must be an array.');
  const limit = validateK(k, ranked.length);
  if (!limit) return 0;
  const threshold = Number.isFinite(options.relevanceThreshold) ? options.relevanceThreshold : 1;
  const relevant = ranked.slice(0, limit).filter((item, index) => relevanceValue(relevance, item, index) >= threshold).length;
  return Number((relevant / limit).toFixed(6));
}

export const precision = precisionAtK;

function candidateData(item) {
  return item?.opportunity || item?.candidate || item || {};
}

function categories(item) {
  const value = candidateData(item);
  return list(value.category || value.type || value.kind).map((entry) => entry.toLowerCase());
}

function tags(item) {
  return anyValue(candidateData(item), ['tags', 'topics', 'skills', 'domains']).map((entry) => entry.toLowerCase());
}

/** Summarize top-K list diversity and catalog coverage without sampling. */
export function summarizeDiversityCoverage(ranked = [], catalog = undefined, k = 10) {
  if (!Array.isArray(ranked)) throw new TypeError('ranked must be an array.');
  const limit = validateK(k, ranked.length);
  const top = ranked.slice(0, limit);
  const all = Array.isArray(catalog) ? catalog : ranked;
  const topCategories = new Set(top.flatMap(categories));
  const allCategories = new Set(all.flatMap(categories));
  const topTags = new Set(top.flatMap(tags));
  const allTags = new Set(all.flatMap(tags));
  let pairwiseSimilarity = 0;
  let pairs = 0;
  for (let left = 0; left < top.length; left += 1) {
    const leftTags = new Set(tags(top[left]));
    for (let right = left + 1; right < top.length; right += 1) {
      const rightTags = new Set(tags(top[right]));
      const union = new Set([...leftTags, ...rightTags]);
      const intersection = [...leftTags].filter((tag) => rightTags.has(tag)).length;
      pairwiseSimilarity += union.size ? intersection / union.size : 0;
      pairs += 1;
    }
  }
  const ids = new Set(top.map(itemId));
  const catalogIds = new Set(all.map(itemId));
  const intraListDiversity = pairs ? 1 - pairwiseSimilarity / pairs : (top.length ? 1 : 0);
  const result = {
    recommendedCount: top.length,
    uniqueCategories: topCategories.size,
    uniqueTags: topTags.size,
    intraListDiversity: Number(intraListDiversity.toFixed(6)),
    diversity: {
      uniqueCategories: topCategories.size,
      uniqueTags: topTags.size,
      intraListDiversity: Number(intraListDiversity.toFixed(6))
    },
    coverage: {
      opportunities: { recommended: ids.size, total: catalogIds.size, rate: catalogIds.size ? Number((ids.size / catalogIds.size).toFixed(6)) : 0 },
      categories: { recommended: topCategories.size, total: allCategories.size, rate: allCategories.size ? Number((topCategories.size / allCategories.size).toFixed(6)) : 0 },
      tags: { recommended: topTags.size, total: allTags.size, rate: allTags.size ? Number((topTags.size / allTags.size).toFixed(6)) : 0 }
    }
  };
  return result;
}

export const diversityCoverageSummary = summarizeDiversityCoverage;

function mean(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)) : 0;
}

/**
 * Evaluate one or more offline user slices. The result is plain JSON data,
 * suitable for persistence or comparison in an experiment artifact.
 */
export function createEvaluationReport(input = {}) {
  const cases = Array.isArray(input.cases) ? input.cases : (Array.isArray(input.evaluations) ? input.evaluations : []);
  const k = input.k === undefined ? 10 : input.k;
  if (!Number.isInteger(k) || k < 0) throw new RangeError('k must be a non-negative integer.');
  const caseReports = cases.map((evaluationCase, index) => {
    const user = evaluationCase?.user || {};
    const opportunities = evaluationCase?.opportunities || evaluationCase?.candidates || [];
    const ranked = rankCandidates(user, opportunities, { referenceDate: input.referenceDate });
    const relevance = evaluationCase?.relevance ?? evaluationCase?.labels ?? evaluationCase?.relevantIds;
    const diversityCoverage = summarizeDiversityCoverage(ranked, opportunities, k);
    return {
      id: clean(evaluationCase?.id) || `case-${index + 1}`,
      ndcgAtK: ndcgAtK(ranked, relevance, k),
      precisionAtK: precisionAtK(ranked, relevance, k, input),
      diversityCoverage,
      ranking: ranked.slice(0, k).map(({ id, rank, score, featureVector }) => ({ id, rank, score, featureVector }))
    };
  });
  const report = {
    reportVersion: 'orbit-evaluation-v1',
    baseline: true,
    trainedModel: false,
    model: getModelVersionMetadata(),
    k,
    referenceDate: clean(input.referenceDate) || null,
    caseCount: caseReports.length,
    cases: caseReports,
    summary: {
      ndcgAtK: mean(caseReports.map((item) => item.ndcgAtK)),
      precisionAtK: mean(caseReports.map((item) => item.precisionAtK)),
      intraListDiversity: mean(caseReports.map((item) => item.diversityCoverage.intraListDiversity)),
      categoryCoverage: mean(caseReports.map((item) => item.diversityCoverage.coverage.categories.rate)),
      opportunityCoverage: mean(caseReports.map((item) => item.diversityCoverage.coverage.opportunities.rate))
    }
  };
  return JSON.parse(JSON.stringify(report));
}

export const evaluateRanking = createEvaluationReport;
export const evaluateBaseline = createEvaluationReport;

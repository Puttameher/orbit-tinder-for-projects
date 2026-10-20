/**
 * Orbit domain primitives.
 *
 * This module is deliberately dependency-free and side-effect free. It only
 * operates on declared profile/opportunity data. In particular, ranking is a
 * documented lexical baseline rather than a hidden model prediction, and all
 * agent outputs are drafts that require human review.
 */

export const RANKING_METHOD = 'transparent-hybrid-v1';

export const RANKING_WEIGHTS = Object.freeze({
  interest: 0.30,
  skill: 0.25,
  availability: 0.20,
  freshness: 0.10,
  stage: 0.15
});

const MAX_LIST_ITEMS = 40;
const MAX_TEXT = 500;
const DAY = 24 * 60 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clean(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function key(value) {
  return clean(value).toLocaleLowerCase();
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function list(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[,;\n]+/) : value === undefined || value === null ? [] : [value];
  return unique(values.map((item) => {
    if (typeof item === 'string') return clean(item, 120);
    if (isObject(item)) return clean(item.name || item.title || item.label || item.value, 120);
    return '';
  }).filter(Boolean)).slice(0, MAX_LIST_ITEMS);
}

function tokenSet(value) {
  return new Set(key(value).split(/[^a-z0-9+#.-]+/).filter((token) => token.length > 1));
}

function tokensFor(values) {
  const result = new Set();
  for (const value of values) for (const token of tokenSet(value)) result.add(token);
  return result;
}

function parseNumber(value) {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function boundedNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseHours(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return { min: Math.max(0, value), max: Math.max(0, value) };
  const text = clean(value, 120).toLocaleLowerCase();
  if (!text) return { min: null, max: null };
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (range) return { min: Math.max(0, Number(range[1])), max: Math.max(0, Number(range[2])) };
  const single = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (single) {
    const hours = Math.max(0, Number(single[1]));
    return { min: hours, max: hours };
  }
  return { min: null, max: null };
}

function normalizeAvailability(value) {
  if (isObject(value)) {
    const parsed = parseHours(value.hoursPerWeek ?? value.hours ?? value.commitment);
    const min = parseNumber(value.minHoursPerWeek ?? value.minHours) ?? parsed.min;
    const max = parseNumber(value.maxHoursPerWeek ?? value.maxHours) ?? parsed.max;
    return {
      label: clean(value.label || value.commitment || value.mode, 120) || null,
      minHoursPerWeek: min === null ? null : Math.max(0, min),
      maxHoursPerWeek: max === null ? null : Math.max(0, max),
      days: list(value.days),
      timezone: clean(value.timezone, 80) || null
    };
  }
  const label = clean(value, 120);
  const parsed = parseHours(value);
  return {
    label: label || null,
    minHoursPerWeek: parsed.min,
    maxHoursPerWeek: parsed.max,
    days: /weekend/i.test(label) ? ['saturday', 'sunday'] : [],
    timezone: null
  };
}

function normalizeStage(value) {
  const stage = key(value);
  const aliases = {
    idea: 'concept',
    ideation: 'concept',
    early: 'concept',
    mvp: 'prototype',
    prototyping: 'prototype',
    active: 'building',
    live: 'production',
    shipped: 'production'
  };
  return aliases[stage] || stage || null;
}

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stableId(prefix, value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function result(value, extras = {}) {
  return { ok: true, valid: true, value, ...extras, ...(isObject(value) ? value : {}) };
}

function error(code, message, fields = []) {
  return { ok: false, valid: false, error: { code, message, fields } };
}

function normalizeSkills(value) {
  return list(value);
}

/** Normalize declared profile context without consulting external services. */
export function normalizeProfile(input = {}) {
  const source = isObject(input) ? input : {};
  const availability = normalizeAvailability(source.availability ?? source.commitment);
  return {
    id: clean(source.id, 120) || null,
    name: clean(source.name || source.displayName, 120),
    headline: clean(source.headline || source.focus, 240) || null,
    interests: list(source.interests ?? source.domains),
    skills: normalizeSkills(source.skills),
    goals: list(source.goals ?? source.objectives),
    preferredStages: list(source.preferredStages ?? source.stagePreferences ?? source.stages).map(normalizeStage).filter(Boolean),
    availability,
    timezone: clean(source.timezone || availability.timezone, 80) || null
  };
}

/** Validate and normalize a profile; errors are safe for display to callers. */
export function validateProfile(input) {
  if (!isObject(input)) return error('INVALID_PROFILE', 'Profile must be an object.');
  const normalized = normalizeProfile(input);
  const fields = [];
  if (!normalized.name) fields.push({ field: 'name', message: 'name is required.' });
  if (normalized.interests.length > MAX_LIST_ITEMS) fields.push({ field: 'interests', message: `interests cannot exceed ${MAX_LIST_ITEMS} items.` });
  if (normalized.skills.length > MAX_LIST_ITEMS) fields.push({ field: 'skills', message: `skills cannot exceed ${MAX_LIST_ITEMS} items.` });
  const rawAvailability = input.availability ?? input.commitment;
  if (rawAvailability !== undefined && rawAvailability !== null && typeof rawAvailability !== 'string' && typeof rawAvailability !== 'number' && !isObject(rawAvailability)) {
    fields.push({ field: 'availability', message: 'availability must be text, a number, or an object.' });
  }
  if (normalized.availability.minHoursPerWeek !== null && normalized.availability.maxHoursPerWeek !== null && normalized.availability.minHoursPerWeek > normalized.availability.maxHoursPerWeek) {
    fields.push({ field: 'availability', message: 'minimum availability cannot exceed maximum availability.' });
  }
  return fields.length ? error('INVALID_PROFILE', 'Profile failed validation.', fields) : result(normalized);
}

export const validateAndNormalizeProfile = validateProfile;

function normalizeProvenance(source, input = {}) {
  const sourceObject = isObject(source) ? source : {};
  const provider = clean(sourceObject.provider || sourceObject.name || (typeof source === 'string' ? source : input.provider), 120) || null;
  const sourceId = clean(sourceObject.id || sourceObject.sourceId || input.sourceId, 160) || null;
  const url = clean(sourceObject.url || sourceObject.sourceUrl || input.sourceUrl, 1000) || null;
  const observedAt = safeDate(sourceObject.observedAt || sourceObject.fetchedAt || sourceObject.retrievedAt || input.observedAt || input.fetchedAt);
  const publishedAt = safeDate(sourceObject.publishedAt || input.publishedAt);
  return { provider, sourceId, url, observedAt, publishedAt };
}

/** Normalize an opportunity and retain enough provenance to audit its source. */
export function normalizeOpportunity(input = {}) {
  const source = isObject(input) ? input : {};
  const provenance = normalizeProvenance(source.provenance ?? source.source, source);
  const title = clean(source.title || source.name, 240);
  const summary = clean(source.summary || source.description || source.excerpt, 1200);
  const id = clean(source.id, 160) || provenance.sourceId || stableId('opportunity', `${title}|${summary}`);
  const owner = isObject(source.owner)
    ? { id: clean(source.owner.id, 120) || null, name: clean(source.owner.name || source.owner.displayName, 160) || null, email: clean(source.owner.email, 240) || null }
    : { id: null, name: clean(source.owner, 160) || null, email: null };
  const commitment = clean(source.commitment || source.timeCommitment || source.availability, 160) || null;
  const commitmentHours = normalizeAvailability(commitment);
  return {
    id,
    title,
    summary,
    kind: clean(source.kind || source.type || source.category, 80) || 'project',
    stage: normalizeStage(source.stage),
    tags: list(source.tags ?? source.interests ?? source.domains),
    needs: list(source.needs ?? source.roles ?? source.skillsNeeded),
    skills: list(source.skills ?? source.stack ?? source.technologies),
    commitment,
    commitmentHours,
    owner,
    license: clean(source.license, 120) || null,
    visibility: clean(source.visibility, 80) || null,
    publishedAt: safeDate(source.publishedAt || provenance.publishedAt),
    updatedAt: safeDate(source.updatedAt),
    provenance
  };
}

export function validateOpportunity(input) {
  if (!isObject(input)) return error('INVALID_OPPORTUNITY', 'Opportunity must be an object.');
  const normalized = normalizeOpportunity(input);
  const fields = [];
  if (!normalized.title) fields.push({ field: 'title', message: 'title is required.' });
  if (!normalized.summary && !normalized.tags.length && !normalized.needs.length && !normalized.skills.length) {
    fields.push({ field: 'summary', message: 'summary or declared opportunity context is required.' });
  }
  return fields.length ? error('INVALID_OPPORTUNITY', 'Opportunity failed validation.', fields) : result(normalized);
}

export const normalizeOpportunityResult = validateOpportunity;

function opportunityTerms(opportunity) {
  return {
    interest: [...opportunity.tags, ...list(opportunity.interests), ...list(opportunity.domains), opportunity.title, opportunity.summary].filter(Boolean),
    skill: [...opportunity.needs, ...opportunity.skills]
  };
}

function matchingFeature(profileValues, targetValues) {
  const profiles = unique(profileValues);
  const targets = unique(targetValues);
  if (!profiles.length || !targets.length) return { score: 50, exactScore: 50, tokenScore: 50, matches: [], targetMatches: [], known: false };
  const matches = [];
  const targetMatches = [];
  for (const profileValue of profiles) {
    const profileKey = key(profileValue);
    const exact = targets.find((target) => key(target) === profileKey || key(target).includes(profileKey) || profileKey.includes(key(target)));
    if (exact) {
      matches.push(profileValue);
      targetMatches.push(exact);
    }
  }
  const profileTokens = tokensFor(profiles);
  const targetTokens = tokensFor(targets);
  const tokenHits = [...profileTokens].filter((token) => targetTokens.has(token));
  const exactScore = boundedNumber(matches.length / profiles.length * 100, 0, 100);
  const tokenScore = profileTokens.size ? boundedNumber(tokenHits.length / profileTokens.size * 100, 0, 100) : 0;
  return {
    score: Math.round(exactScore * 0.70 + tokenScore * 0.30),
    exactScore: Math.round(exactScore),
    tokenScore: Math.round(tokenScore),
    matches: unique(matches),
    targetMatches: unique(targetMatches),
    known: true
  };
}

function availabilityFeature(profile, opportunity) {
  const profileAvailability = profile.availability || normalizeAvailability();
  const required = opportunity.commitmentHours || normalizeAvailability(opportunity.commitment);
  const available = profileAvailability.maxHoursPerWeek;
  const needed = required.maxHoursPerWeek;
  if (available === null || needed === null) {
    const labelsKnown = Boolean(profileAvailability.label || required.label);
    return { score: labelsKnown ? 70 : 50, known: labelsKnown, available, needed, evidence: labelsKnown ? 'Declared timing exists; weekly hours are unspecified.' : 'Weekly hours are unspecified.' };
  }
  const score = available >= needed ? 100 : boundedNumber(available / Math.max(needed, 1) * 100, 0, 100);
  return { score: Math.round(score), known: true, available, needed, evidence: `${available} available hours versus ${needed} required hours per week.` };
}

function freshnessFeature(opportunity, options) {
  const asOf = options.asOf ? new Date(options.asOf) : new Date();
  const dateValue = opportunity.provenance?.observedAt || opportunity.updatedAt || opportunity.publishedAt;
  const date = dateValue ? new Date(dateValue) : null;
  if (!date || Number.isNaN(date.getTime()) || Number.isNaN(asOf.getTime())) return { score: 50, known: false, ageDays: null, date: null, evidence: 'No source timestamp was provided.' };
  const halfLifeDays = Number.isFinite(options.freshnessHalfLifeDays) && options.freshnessHalfLifeDays > 0 ? options.freshnessHalfLifeDays : 30;
  const ageDays = Math.max(0, (asOf.getTime() - date.getTime()) / DAY);
  return { score: Math.round(boundedNumber(100 * Math.pow(0.5, ageDays / halfLifeDays), 0, 100)), known: true, ageDays: Number(ageDays.toFixed(1)), date: date.toISOString(), evidence: `Observed ${Number(ageDays.toFixed(1))} days ago.` };
}

function stageFeature(profile, opportunity) {
  if (!opportunity.stage) return { score: 50, known: false, evidence: 'Opportunity stage is not declared.' };
  const preferred = profile.preferredStages || [];
  if (!preferred.length) return { score: 70, known: true, evidence: `Stage declared as ${opportunity.stage}; no stage preference was declared.` };
  if (preferred.includes(opportunity.stage)) return { score: 100, known: true, evidence: `Declared preference includes ${opportunity.stage}.` };
  const adjacent = new Set(preferred.flatMap((stage) => stage === 'concept' ? ['prototype'] : stage === 'prototype' ? ['concept', 'building'] : stage === 'building' ? ['prototype', 'production'] : ['building']));
  return { score: adjacent.has(opportunity.stage) ? 65 : 25, known: true, evidence: `${opportunity.stage} is outside the declared stage preferences.` };
}

function featureRecord(name, feature) {
  const weight = RANKING_WEIGHTS[name];
  return { ...feature, score: Math.round(boundedNumber(feature.score, 0, 100)), weight, contribution: Number((boundedNumber(feature.score, 0, 100) * weight).toFixed(2)) };
}

/**
 * Score one opportunity with an inspectable lexical hybrid:
 * exact declared overlap contributes 70% of interest/skill, token overlap
 * contributes 30%, and the remaining signals are deterministic rules.
 */
export function scoreOpportunity(opportunityInput, profileInput, options = {}) {
  const opportunity = normalizeOpportunity(opportunityInput);
  const profile = normalizeProfile(profileInput);
  const terms = opportunityTerms(opportunity);
  const interestMatch = matchingFeature(profile.interests, terms.interest);
  const skillMatch = matchingFeature(profile.skills, terms.skill);
  const features = {
    interest: featureRecord('interest', { ...interestMatch, evidence: interestMatch.matches.length ? `Matched ${interestMatch.matches.join(', ')}.` : 'No declared interest overlap.' }),
    skill: featureRecord('skill', { ...skillMatch, evidence: skillMatch.matches.length ? `Matched ${skillMatch.matches.join(', ')}.` : 'No declared skill overlap.' }),
    availability: featureRecord('availability', availabilityFeature(profile, opportunity)),
    freshness: featureRecord('freshness', freshnessFeature(opportunity, options)),
    stage: featureRecord('stage', stageFeature(profile, opportunity))
  };
  const score = Math.round(boundedNumber(Object.values(features).reduce((total, feature) => total + feature.contribution, 0), 0, 100));
  return {
    score,
    method: RANKING_METHOD,
    weights: RANKING_WEIGHTS,
    featureBreakdown: features,
    breakdown: features,
    opportunityId: opportunity.id,
    matched: { interests: interestMatch.matches, skills: skillMatch.matches }
  };
}

export const rankOpportunity = scoreOpportunity;
export const calculateFitScore = scoreOpportunity;

/** Rank opportunities stably by score, preserving source order for ties. */
export function rankOpportunities(opportunities = [], profile, options = {}) {
  if (!Array.isArray(opportunities)) return [];
  return opportunities.map((input, index) => {
    const opportunity = normalizeOpportunity(input);
    const ranking = scoreOpportunity(opportunity, profile, options);
    return { rank: 0, opportunity, ...ranking, _index: index };
  }).sort((a, b) => b.score - a.score || a._index - b._index).map(({ _index, ...item }, index) => ({ ...item, rank: index + 1 }));
}

export const rank = rankOpportunities;

function clip(value, max = 240) {
  return clean(value, max);
}

function take(values, max) {
  return values.filter(Boolean).slice(0, max);
}

/** Build a bounded explanation grounded in the normalized feature evidence. */
export function explainFit(opportunityInput, profileInput, options = {}) {
  const opportunity = normalizeOpportunity(opportunityInput);
  const profile = normalizeProfile(profileInput);
  const ranking = scoreOpportunity(opportunity, profile, options);
  const maxItems = Number.isInteger(options.maxItems) ? Math.max(1, Math.min(6, options.maxItems)) : 3;
  const strengths = [];
  const gaps = [];
  const tradeoffs = [];
  const interest = ranking.featureBreakdown.interest;
  const skill = ranking.featureBreakdown.skill;
  const availability = ranking.featureBreakdown.availability;
  const freshness = ranking.featureBreakdown.freshness;
  const stage = ranking.featureBreakdown.stage;
  if (interest.matches?.length) strengths.push(`Declared interest overlap: ${interest.matches.join(', ')}.`);
  if (skill.matches?.length) strengths.push(`Declared skill overlap: ${skill.matches.join(', ')}.`);
  if (availability.score >= 80) strengths.push('The declared time commitment appears workable.');
  if (freshness.score >= 70) strengths.push('The source appears relatively fresh.');
  if (stage.score >= 80) strengths.push('The opportunity stage matches the declared preference.');
  if (!interest.matches?.length && profile.interests.length) gaps.push(`No direct match was found for interests such as ${profile.interests.slice(0, 2).join(' or ')}.`);
  const missingSkills = opportunity.needs.filter((need) => !skill.targetMatches?.some((match) => key(match) === key(need))).slice(0, 3);
  if (missingSkills.length) gaps.push(`Open needs without a declared match: ${missingSkills.join(', ')}.`);
  if (availability.score < 70) gaps.push(availability.known ? 'The declared weekly capacity may be below the opportunity commitment.' : 'Weekly capacity needs clarification.');
  if (!freshness.known) gaps.push('Source freshness cannot be verified from the available provenance.');
  if (!stage.known) gaps.push('The opportunity stage is not declared.');
  if (opportunity.stage === 'concept') tradeoffs.push('The opportunity is early-stage, so the first milestone may need more definition.');
  if (opportunity.stage === 'production') tradeoffs.push('The opportunity is established, so room for changing direction may be narrower.');
  if (missingSkills.length) tradeoffs.push('Taking this on may require negotiating ownership of the open needs.');
  if (!freshness.known || freshness.score < 60) tradeoffs.push('Stale or missing source timing makes current scope harder to assess.');
  if (!tradeoffs.length) tradeoffs.push('The score reflects declared context; a conversation is still needed to confirm scope and working style.');

  const evidence = Object.entries(ranking.featureBreakdown).map(([feature, value]) => ({
    feature,
    label: feature,
    value: clip(value.evidence),
    score: value.score,
    weight: value.weight,
    contribution: value.contribution,
    source: feature === 'interest' ? ['profile.interests', 'opportunity.tags'] : feature === 'skill' ? ['profile.skills', 'opportunity.needs', 'opportunity.skills'] : feature === 'availability' ? ['profile.availability', 'opportunity.commitment'] : feature === 'freshness' ? ['opportunity.provenance'] : ['profile.preferredStages', 'opportunity.stage']
  }));
  if (opportunity.provenance?.provider || opportunity.provenance?.url) evidence.push({ feature: 'provenance', label: 'source', value: clip([opportunity.provenance.provider, opportunity.provenance.url].filter(Boolean).join(' · ')), source: ['opportunity.provenance'] });
  const knownFeatures = Object.values(ranking.featureBreakdown).filter((item) => item.known !== false).length;
  const confidence = Number(Math.min(0.95, 0.40 + knownFeatures * 0.10 + (evidence.length > 5 ? 0.05 : 0)).toFixed(2));
  return {
    score: ranking.score,
    confidence,
    method: ranking.method,
    featureBreakdown: ranking.featureBreakdown,
    strengths: take(strengths.map((item) => clip(item)), maxItems),
    gaps: take(gaps.map((item) => clip(item)), maxItems),
    tradeoffs: take(tradeoffs.map((item) => clip(item)), maxItems),
    evidence: evidence.slice(0, Number.isInteger(options.maxEvidence) ? Math.max(1, Math.min(10, options.maxEvidence)) : 8),
    opportunityId: opportunity.id
  };
}

export const explainOpportunityFit = explainFit;
export const buildFitExplanation = explainFit;

function action(id, type, title, rationale, extra = {}) {
  return { id, type, title, rationale: clip(rationale), status: 'proposed', draftOnly: true, requiresApproval: true, sideEffect: 'none', ...extra };
}

/** Plan reviewable next actions; this function never performs an action. */
export function planNextActions(opportunityInput, profileInput, fitInput, options = {}) {
  const opportunity = normalizeOpportunity(opportunityInput);
  const profile = normalizeProfile(profileInput);
  const fit = fitInput?.featureBreakdown ? fitInput : explainFit(opportunity, profile, options);
  const actions = [action('review-fit', 'review', 'Review the fit read', 'Inspect the declared evidence, score breakdown, and trade-offs before deciding.')];
  if (fit.gaps?.length) actions.push(action('clarify-gaps', 'clarify', 'Clarify the open gaps', 'Turn the visible gaps into one or two questions for the opportunity owner.', { questions: fit.gaps.slice(0, 2) }));
  if (fit.featureBreakdown?.freshness?.known === false || fit.featureBreakdown?.freshness?.score < 60) actions.push(action('verify-source', 'verify', 'Verify current scope', 'Check the source and latest scope before investing time.', { provenance: opportunity.provenance }));
  if (options.mutualInterest === true) actions.push(action('draft-introduction', 'draft-introduction', 'Review an introduction draft', 'Mutual interest is declared; review the draft locally before any contact.', { enabled: true }));
  else actions.push(action('confirm-mutual-interest', 'confirm', 'Confirm mutual interest first', 'Orbit does not contact anyone from a one-sided recommendation.', { enabled: false, availableWhen: 'mutualInterest === true' }));
  actions.push(action('draft-remix', 'draft-remix', 'Make a reversible remix brief', 'Create a separate brief if the source opportunity is useful but its current shape needs a different first milestone.', { enabled: true }));
  return {
    type: 'next-action-plan',
    status: 'draft',
    draftOnly: true,
    requiresApproval: true,
    sideEffect: 'none',
    opportunityId: opportunity.id,
    actions: actions.slice(0, 6)
  };
}

export const createNextActionPlan = planNextActions;
export const planAgentNextActions = planNextActions;

function ownerName(opportunity) {
  return opportunity.owner?.name || 'the opportunity owner';
}

/** Create an editable introduction object. It has no send operation by design. */
export function createIntroductionDraft(opportunityInput, fitInput, profileInput, options = {}) {
  const opportunity = normalizeOpportunity(opportunityInput);
  const profile = normalizeProfile(profileInput);
  const fit = fitInput?.strengths ? fitInput : explainFit(opportunity, profile, options);
  const salutation = opportunity.owner?.name ? `Hi ${opportunity.owner.name.split(/\s+/)[0]},` : 'Hi there,';
  const overlap = fit.strengths?.[0] || `the shape of ${opportunity.title}`;
  const skills = profile.skills.slice(0, 2).join(' and ') || 'related work';
  const body = `${salutation}\n\nI came across ${opportunity.title} and ${overlap.charAt(0).toLocaleLowerCase()}${overlap.slice(1)} It connects with my experience in ${skills}. I would be glad to compare notes on the first milestone and where help would be most useful.\n\nBest,\n${profile.name || 'Your name'}`;
  return {
    type: 'introduction-draft',
    status: 'draft',
    draftOnly: true,
    sendable: false,
    sent: false,
    requiresApproval: true,
    sourceOpportunityId: opportunity.id,
    recipient: opportunity.owner,
    subject: `A question about ${opportunity.title}`,
    body: clip(body, 1200),
    evidence: (fit.evidence || []).slice(0, 3),
    createdAt: safeDate(options.now) || new Date().toISOString()
  };
}

export const draftIntroduction = createIntroductionDraft;

/** Create a separate, reversible remix brief; the source opportunity is untouched. */
export function createRemixPlan(opportunityInput, profileInput, options = {}) {
  const opportunity = normalizeOpportunity(opportunityInput);
  const profile = normalizeProfile(profileInput);
  const fit = options.fit?.strengths ? options.fit : explainFit(opportunity, profile, options);
  const strengths = profile.skills.slice(0, 2).join(' and ') || 'your declared strengths';
  return {
    type: 'remix-plan',
    id: clean(options.id, 160) || stableId('remix', opportunity.id),
    status: 'draft',
    draftOnly: true,
    requiresApproval: true,
    sideEffect: 'none',
    sourceOpportunityId: opportunity.id,
    sourceTitle: opportunity.title,
    preserve: clip(`Keep the core promise: ${opportunity.summary || opportunity.title}.`),
    change: clip(`Shape the first version around ${strengths}, with one clear owner and a smaller initial audience.`),
    firstMilestone: 'Ship a 7-day vertical slice with one user, one happy path, and one honest outcome.',
    risks: take([
      ...(fit.gaps || []).slice(0, 2),
      'Scope could widen before the first user sees the remix.',
      'Ownership for the next decision still needs agreement.'
    ], 3),
    questions: [
      'What would make the first version unmistakably useful?',
      'Which constraint should remain non-negotiable?',
      `Who owns the next decision for ${opportunity.title}?`
    ],
    evidence: (fit.evidence || []).slice(0, 4),
    createdAt: safeDate(options.now) || new Date().toISOString()
  };
}

export const createRemixDraft = createRemixPlan;

/** Return both safe drafts without sending, publishing, or mutating the source. */
export function createDraftPlan(opportunity, profile, options = {}) {
  const fit = explainFit(opportunity, profile, options);
  return {
    type: 'draft-plan',
    draftOnly: true,
    requiresApproval: true,
    fit,
    introduction: createIntroductionDraft(opportunity, fit, profile, options),
    remix: createRemixPlan(opportunity, profile, { ...options, fit })
  };
}

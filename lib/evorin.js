/**
 * Evorin backend primitives.
 *
 * This module intentionally has no network, filesystem, or package
 * dependencies. The visual analysis function is metadata-only: it never
 * describes pixels that have not been inspected by a real vision provider.
 */

export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export const PREFERENCE_SCOPES = Object.freeze({
  STYLING: 'styling',
  SOCIAL: 'social'
});

const MIME_SIGNATURES = Object.freeze({
  'image/jpeg': (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  'image/webp': (bytes) => bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP'
});

function ascii(bytes, start, end) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function errorResult(code, message, details = {}) {
  return {
    ok: false,
    valid: false,
    error: { code, message, ...details }
  };
}

function valueResult(value, extras = {}) {
  return {
    ok: true,
    valid: true,
    value,
    ...extras,
    ...(isObject(value) ? value : {})
  };
}

function normalizeScope(scope) {
  const value = clean(scope).toLowerCase();
  if (value === 'style' || value === 'styles' || value === 'fashion') return PREFERENCE_SCOPES.STYLING;
  if (value === 'content' || value === 'copy' || value === 'social-content') return PREFERENCE_SCOPES.SOCIAL;
  return value;
}

function toBytes(value) {
  if (value === undefined || value === null) return null;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string' && value.startsWith('data:')) {
    const comma = value.indexOf(',');
    if (comma < 0) return null;
    const encoded = value.slice(comma + 1);
    try {
      if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(encoded, 'base64'));
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function uploadRecord(input) {
  if (isObject(input) && !(input instanceof Uint8Array)) return input;
  return { bytes: input };
}

/**
 * Validate an image upload using its declared type, byte length, and (when
 * bytes are supplied) its file signature. Metadata-only validation is
 * allowed for streaming callers, but is marked as unverified.
 */
export function validateImageUpload(input, options = {}) {
  const upload = uploadRecord(input);
  const maxBytes = options.maxBytes ?? options.maxSizeBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    return errorResult('INVALID_MAX_SIZE', 'maxBytes must be a positive integer.', { maxBytes });
  }

  const declaredType = clean(upload.mimeType || upload.contentType || upload.type).toLowerCase();
  if (!IMAGE_MIME_TYPES.includes(declaredType)) {
    return errorResult('UNSUPPORTED_IMAGE_TYPE', 'Only JPEG, PNG, and WebP images are supported.', {
      mimeType: declaredType || null,
      supported: IMAGE_MIME_TYPES
    });
  }

  const bytes = toBytes(upload.bytes ?? upload.buffer ?? upload.data);
  const sizeBytes = bytes?.byteLength ?? upload.sizeBytes ?? upload.size;
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
    return errorResult('INVALID_IMAGE_SIZE', 'Image size must be a positive integer.', { sizeBytes: sizeBytes ?? null });
  }
  if (sizeBytes > maxBytes) {
    return errorResult('IMAGE_TOO_LARGE', `Image exceeds the ${maxBytes}-byte limit.`, { sizeBytes, maxBytes });
  }

  const signatureVerified = bytes !== null;
  if (signatureVerified && !MIME_SIGNATURES[declaredType](bytes)) {
    return errorResult('IMAGE_SIGNATURE_MISMATCH', 'Image bytes do not match the declared MIME type.', {
      mimeType: declaredType
    });
  }

  const normalized = {
    mimeType: declaredType,
    sizeBytes,
    maxBytes,
    filename: clean(upload.filename || upload.name) || null,
    signatureVerified
  };
  return valueResult(normalized);
}

function safeMetadata(metadata) {
  if (!isObject(metadata)) return {};
  const result = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    const safeKey = clean(key).slice(0, 80);
    if (!safeKey) continue;
    result[safeKey] = typeof value === 'string' ? value.slice(0, 500) : value;
  }
  return result;
}

function filenameTokens(filename) {
  return [...new Set(clean(filename)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .split(/[^a-z0-9]+/i)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 1))].slice(0, 30);
}

/**
 * Produce a structured, honest fallback when no vision provider is present.
 * Every claim is copied from upload metadata or derived from the filename.
 */
export function analyzeVisualFallback(input = {}) {
  const upload = uploadRecord(input);
  const metadata = safeMetadata(upload.metadata);
  const filename = clean(upload.filename || upload.name) || null;
  const mimeType = clean(upload.mimeType || upload.contentType || upload.type).toLowerCase() || null;
  const bytes = toBytes(upload.bytes ?? upload.buffer ?? upload.data);
  const sizeBytes = bytes?.byteLength ?? upload.sizeBytes ?? upload.size ?? null;
  const width = Number.isFinite(metadata.width) ? metadata.width : null;
  const height = Number.isFinite(metadata.height) ? metadata.height : null;
  const dimensions = width && height ? { width, height } : null;

  const analysis = {
    mode: 'metadata-fallback',
    provider: 'none',
    visionAvailable: false,
    isVisionAnalysis: false,
    confidence: 0,
    claims: {
      filename,
      filenameTokens: filenameTokens(filename),
      mimeType,
      sizeBytes,
      dimensions,
      metadata
    },
    limitations: [
      'Pixel content was not inspected; this result contains metadata and filename hints only.',
      'Do not treat filename tokens or metadata as confirmed visual properties.'
    ]
  };
  return valueResult(analysis);
}

function tokens(value) {
  return new Set(String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function asList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const item = clean(value);
  return item ? [item] : [];
}

function preferenceTaskIds(preference) {
  return asList(preference.taskIds ?? preference.tasks ?? preference.taskId);
}

function preferenceTags(preference) {
  return asList(preference.tags ?? preference.taskTags);
}

function taskText(task) {
  if (typeof task === 'string') return task;
  if (!isObject(task)) return '';
  return [task.name, task.title, task.description, ...(Array.isArray(task.tags) ? task.tags : [])].filter(Boolean).join(' ');
}

/**
 * Retrieve and rank only preferences applicable to the requested task.
 * A preference with no task IDs is treated as a scope-wide default.
 */
export function retrieveTaskPreferences(preferences = [], task = {}, options = {}) {
  if (!Array.isArray(preferences)) return [];
  const taskObject = typeof task === 'string' ? { title: task } : (isObject(task) ? task : {});
  const scope = normalizeScope(options.scope ?? taskObject.scope ?? taskObject.kind);
  const taskId = clean(options.taskId ?? taskObject.id ?? taskObject.taskId);
  const taskTags = new Set(asList(options.tags ?? taskObject.tags));
  const taskTokens = tokens(taskText(taskObject));
  const now = Date.now();

  return preferences
    .map((preference, index) => {
      if (!isObject(preference)) return null;
      const preferenceScope = normalizeScope(preference.scope);
      if (![PREFERENCE_SCOPES.STYLING, PREFERENCE_SCOPES.SOCIAL].includes(preferenceScope)) return null;
      if (scope && preferenceScope !== scope) return null;
      const ids = preferenceTaskIds(preference);
      if (taskId && ids.length && !ids.includes(taskId)) return null;
      const tags = preferenceTags(preference);
      const tagMatches = tags.filter((tag) => taskTags.has(tag));
      const preferenceTokens = tokens([preference.key, preference.value, preference.label, ...tags].join(' '));
      const tokenMatches = [...preferenceTokens].filter((token) => taskTokens.has(token));
      const confidence = Number.isFinite(preference.confidence) ? clamp(preference.confidence) : 0.5;
      const evidenceCount = Number.isInteger(preference.evidenceCount) ? Math.max(0, preference.evidenceCount) : 0;
      const explicitTaskMatch = Boolean(taskId && ids.includes(taskId));
      const score = clamp(
        confidence * 0.55 + Math.min(evidenceCount, 5) / 5 * 0.2 +
        (explicitTaskMatch ? 0.2 : 0) + Math.min(0.05, tagMatches.length * 0.025) +
        Math.min(0.05, tokenMatches.length * 0.01)
      );
      const updatedAt = Date.parse(preference.updatedAt || preference.createdAt || '') || 0;
      const recency = updatedAt ? Math.max(0, 1 - Math.max(0, now - updatedAt) / (365 * 24 * 60 * 60 * 1000)) : 0;
      return {
        ...preference,
        scope: preferenceScope,
        score: Number((score + recency * 0.02).toFixed(4)),
        matchReasons: [
          `${preferenceScope} scope`,
          ...(explicitTaskMatch ? ['task match'] : []),
          ...(tagMatches.length ? [`tag match: ${tagMatches.join(', ')}`] : []),
          ...(tokenMatches.length ? [`text match: ${tokenMatches.slice(0, 5).join(', ')}`] : [])
        ],
        _inputIndex: index
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a._inputIndex - b._inputIndex)
    .map(({ _inputIndex, ...preference }) => preference);
}

export const rankPreferences = retrieveTaskPreferences;
export const getTaskScopedPreferences = retrieveTaskPreferences;

function feedbackSignal(signal) {
  const normalized = clean(signal).toLowerCase();
  if (['accept', 'accepted', 'positive', 'like', 'liked', 'up'].includes(normalized)) return 'positive';
  if (['reject', 'rejected', 'negative', 'dislike', 'disliked', 'down'].includes(normalized)) return 'negative';
  return null;
}

function feedbackIdentity(feedback) {
  const preferenceId = clean(feedback.preferenceId || feedback.id);
  const key = clean(feedback.key);
  const value = clean(feedback.value);
  return preferenceId || `${key}:${value}`;
}

/**
 * Add one distinct piece of feedback. A preference is promoted or rejected
 * only after minEvidence distinct evidence IDs in the same scope agree.
 */
export function accumulatePreferenceFeedback(state = {}, feedback = {}, options = {}) {
  if (!isObject(feedback)) return errorResult('INVALID_FEEDBACK', 'Feedback must be an object.');
  const scope = normalizeScope(feedback.scope);
  if (![PREFERENCE_SCOPES.STYLING, PREFERENCE_SCOPES.SOCIAL].includes(scope)) {
    return errorResult('INVALID_PREFERENCE_SCOPE', 'Feedback scope must be styling or social.', { scope: feedback.scope ?? null });
  }
  const signal = feedbackSignal(feedback.signal ?? feedback.action);
  if (!signal) return errorResult('INVALID_FEEDBACK_SIGNAL', 'Feedback signal must be positive/accept or negative/reject.');
  const identity = feedbackIdentity(feedback);
  if (!identity || identity === ':') return errorResult('MISSING_PREFERENCE_IDENTITY', 'Feedback needs preferenceId or key and value.');
  const evidenceId = clean(feedback.evidenceId || feedback.evidence?.id);
  if (!evidenceId) return errorResult('MISSING_EVIDENCE_ID', 'Each feedback event needs a distinct evidenceId.');
  const minEvidence = options.minEvidence ?? 2;
  if (!Number.isInteger(minEvidence) || minEvidence < 2) {
    return errorResult('INVALID_EVIDENCE_THRESHOLD', 'minEvidence must be an integer of at least 2.');
  }

  const priorLedger = Array.isArray(state.feedbackLedger) ? state.feedbackLedger : [];
  const ledgerKey = `${scope}:${identity}`;
  const existingIndex = priorLedger.findIndex((entry) => entry.ledgerKey === ledgerKey);
  const previous = existingIndex >= 0 ? priorLedger[existingIndex] : {
    ledgerKey,
    scope,
    preferenceId: clean(feedback.preferenceId) || null,
    key: clean(feedback.key) || null,
    value: clean(feedback.value) || null,
    positiveEvidenceIds: [],
    negativeEvidenceIds: [],
    status: 'candidate'
  };
  const evidenceList = signal === 'positive' ? previous.positiveEvidenceIds : previous.negativeEvidenceIds;
  if (evidenceList.includes(evidenceId)) {
    return valueResult({
      state,
      entry: previous,
      duplicate: true,
      promoted: previous.status === 'accepted' || previous.status === 'rejected'
    });
  }

  const nextEntry = {
    ...previous,
    positiveEvidenceIds: signal === 'positive' ? [...previous.positiveEvidenceIds, evidenceId] : [...previous.positiveEvidenceIds],
    negativeEvidenceIds: signal === 'negative' ? [...previous.negativeEvidenceIds, evidenceId] : [...previous.negativeEvidenceIds]
  };
  const positives = nextEntry.positiveEvidenceIds.length;
  const negatives = nextEntry.negativeEvidenceIds.length;
  nextEntry.evidenceCount = positives + negatives;
  nextEntry.threshold = minEvidence;
  nextEntry.status = positives >= minEvidence && positives > negatives
    ? 'accepted'
    : negatives >= minEvidence && negatives > positives ? 'rejected' : 'candidate';

  const nextLedger = [...priorLedger];
  if (existingIndex >= 0) nextLedger[existingIndex] = nextEntry; else nextLedger.push(nextEntry);
  let nextPreferences = Array.isArray(state.preferences) ? state.preferences.map((item) => ({ ...item })) : [];
  const preferenceIndex = nextPreferences.findIndex((item) => {
    if (!isObject(item) || normalizeScope(item.scope) !== scope) return false;
    return feedback.preferenceId ? clean(item.id) === clean(feedback.preferenceId) : clean(item.key) === clean(feedback.key) && clean(item.value) === clean(feedback.value);
  });
  if (nextEntry.status !== 'candidate') {
    if (preferenceIndex >= 0) {
      nextPreferences[preferenceIndex] = {
        ...nextPreferences[preferenceIndex],
        scope,
        status: nextEntry.status === 'accepted' ? 'active' : 'rejected',
        evidenceCount: nextEntry.evidenceCount,
        confidence: Number((nextEntry.status === 'accepted' ? Math.max(nextPreferences[preferenceIndex].confidence ?? 0.5, 0.7) : Math.min(nextPreferences[preferenceIndex].confidence ?? 0.5, 0.3)).toFixed(3))
      };
    } else if (nextEntry.status === 'accepted') {
      nextPreferences.push({
        id: clean(feedback.preferenceId) || `${scope}:${clean(feedback.key)}:${clean(feedback.value)}`,
        scope,
        key: clean(feedback.key) || null,
        value: clean(feedback.value) || null,
        status: 'active',
        confidence: 0.7,
        evidenceCount: nextEntry.evidenceCount
      });
    }
  }

  const nextState = { ...state, preferences: nextPreferences, feedbackLedger: nextLedger };
  return valueResult({
    state: nextState,
    entry: nextEntry,
    duplicate: false,
    promoted: nextEntry.status === 'accepted' || nextEntry.status === 'rejected'
  });
}

export const recordPreferenceFeedback = accumulatePreferenceFeedback;

function textField(value, field, max = 2000) {
  const text = clean(value);
  return text && text.length <= max ? null : { field, message: `${field} must be a non-empty string of at most ${max} characters.` };
}

/** Validate the stable style recommendation shape consumed by exports. */
export function validateStyleRecommendation(input) {
  if (!isObject(input)) return errorResult('INVALID_STYLE_RECOMMENDATION', 'Style recommendation must be an object.');
  const errors = [];
  if (normalizeScope(input.scope) !== PREFERENCE_SCOPES.STYLING) errors.push({ field: 'scope', message: 'scope must be styling.' });
  for (const field of ['taskId', 'title']) {
    const issue = textField(input[field], field, 300);
    if (issue) errors.push(issue);
  }
  const rawItems = input.recommendations ?? input.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) errors.push({ field: 'recommendations', message: 'at least one recommendation is required.' });
  const recommendations = Array.isArray(rawItems) ? rawItems.map((item, index) => {
    if (!isObject(item)) {
      errors.push({ field: `recommendations[${index}]`, message: 'recommendation must be an object.' });
      return null;
    }
    const valueIssue = textField(item.value, `recommendations[${index}].value`, 500);
    const rationaleIssue = textField(item.rationale, `recommendations[${index}].rationale`, 1000);
    if (valueIssue) errors.push(valueIssue);
    if (rationaleIssue) errors.push(rationaleIssue);
    return {
      category: clean(item.category) || 'other',
      value: clean(item.value),
      rationale: clean(item.rationale)
    };
  }).filter(Boolean) : [];
  if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) {
    errors.push({ field: 'confidence', message: 'confidence must be between 0 and 1.' });
  }
  if (errors.length) return errorResult('INVALID_STYLE_RECOMMENDATION', 'Style recommendation failed validation.', { fields: errors });
  const normalized = {
    id: clean(input.id) || null,
    taskId: clean(input.taskId),
    scope: PREFERENCE_SCOPES.STYLING,
    title: clean(input.title),
    recommendations,
    confidence: input.confidence === undefined ? null : input.confidence,
    sourcePreferenceIds: asList(input.sourcePreferenceIds)
  };
  return valueResult(normalized);
}

/** Validate a social content package without allowing styling fields to leak in. */
export function validateSocialContentPackage(input) {
  if (!isObject(input)) return errorResult('INVALID_SOCIAL_CONTENT_PACKAGE', 'Social content package must be an object.');
  const errors = [];
  if (normalizeScope(input.scope) !== PREFERENCE_SCOPES.SOCIAL) errors.push({ field: 'scope', message: 'scope must be social.' });
  for (const [field, max] of [['taskId', 300], ['platform', 80], ['caption', 4000], ['altText', 1000]]) {
    const issue = textField(input[field], field, max);
    if (issue) errors.push(issue);
  }
  if (!Array.isArray(input.hashtags)) errors.push({ field: 'hashtags', message: 'hashtags must be an array.' });
  const hashtags = Array.isArray(input.hashtags) ? input.hashtags.map((tag, index) => {
    const value = clean(tag);
    if (!/^#[a-z0-9_]{1,80}$/i.test(value)) errors.push({ field: `hashtags[${index}]`, message: 'hashtags must use #letters, numbers, or underscores.' });
    return value;
  }) : [];
  if (input.callToAction !== undefined && input.callToAction !== null && textField(input.callToAction, 'callToAction', 300)) errors.push({ field: 'callToAction', message: 'callToAction must be a non-empty string of at most 300 characters.' });
  if (input.variants !== undefined && (!Array.isArray(input.variants) || input.variants.some((variant) => !isObject(variant) || !clean(variant.caption)))) {
    errors.push({ field: 'variants', message: 'variants must contain objects with captions.' });
  }
  if (errors.length) return errorResult('INVALID_SOCIAL_CONTENT_PACKAGE', 'Social content package failed validation.', { fields: errors });
  const normalized = {
    id: clean(input.id) || null,
    taskId: clean(input.taskId),
    scope: PREFERENCE_SCOPES.SOCIAL,
    platform: clean(input.platform),
    caption: clean(input.caption),
    hashtags,
    altText: clean(input.altText),
    callToAction: clean(input.callToAction) || null,
    variants: Array.isArray(input.variants) ? input.variants.map((variant) => ({ caption: clean(variant.caption), hashtags: asList(variant.hashtags) })) : []
  };
  return valueResult(normalized);
}

function validRelativePath(path) {
  const value = clean(path);
  return Boolean(value) && !value.startsWith('/') && !/^[a-z]:[\\/]/i.test(value) && !value.split(/[\\/]/).includes('..');
}

/**
 * Generate a portable manifest containing validated outputs and asset metadata.
 * Image bytes are never embedded in the manifest.
 */
export function generateExportManifest(input = {}) {
  if (!isObject(input)) return errorResult('INVALID_EXPORT_INPUT', 'Export input must be an object.');
  const assets = input.assets ?? input.images ?? [];
  if (!Array.isArray(assets)) return errorResult('INVALID_EXPORT_ASSETS', 'assets must be an array.');
  const assetErrors = [];
  const normalizedAssets = assets.map((asset, index) => {
    if (!isObject(asset)) {
      assetErrors.push({ field: `assets[${index}]`, message: 'asset must be an object.' });
      return null;
    }
    const path = clean(asset.path || asset.filename || asset.name);
    if (!validRelativePath(path)) assetErrors.push({ field: `assets[${index}].path`, message: 'asset path must be relative and cannot contain ..' });
    const validation = validateImageUpload(asset, { maxBytes: input.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES });
    if (!validation.ok) assetErrors.push({ field: `assets[${index}]`, ...validation.error });
    return {
      id: clean(asset.id) || `asset-${index + 1}`,
      path,
      mimeType: validation.ok ? validation.mimeType : clean(asset.mimeType || asset.type).toLowerCase() || null,
      sizeBytes: validation.ok ? validation.sizeBytes : asset.sizeBytes ?? asset.size ?? null,
      signatureVerified: validation.ok ? validation.signatureVerified : false
    };
  }).filter(Boolean);
  if (assetErrors.length) return errorResult('INVALID_EXPORT_ASSETS', 'One or more assets failed validation.', { fields: assetErrors });

  const styleInput = input.styleRecommendation ?? input.style;
  const socialInput = input.socialContentPackage ?? input.social;
  const style = styleInput === undefined ? null : validateStyleRecommendation(styleInput);
  const social = socialInput === undefined ? null : validateSocialContentPackage(socialInput);
  if (style && !style.ok) return errorResult('INVALID_EXPORT_STYLE', 'Style recommendation cannot be exported.', { cause: style.error });
  if (social && !social.ok) return errorResult('INVALID_EXPORT_SOCIAL', 'Social content package cannot be exported.', { cause: social.error });

  const taskId = clean(input.taskId || style?.taskId || social?.taskId) || null;
  const generatedAt = clean(input.generatedAt) || new Date().toISOString();
  if (Number.isNaN(Date.parse(generatedAt))) return errorResult('INVALID_EXPORT_TIMESTAMP', 'generatedAt must be an ISO-compatible timestamp.');
  const manifest = {
    manifestVersion: '1.0',
    type: 'evorin-export',
    exportId: clean(input.exportId) || `evorin-${taskId || 'export'}-${generatedAt.replace(/[^0-9]/g, '').slice(0, 14)}`,
    generatedAt,
    taskId,
    assets: normalizedAssets,
    outputs: {
      styleRecommendation: style?.value ?? null,
      socialContentPackage: social?.value ?? null
    }
  };
  return valueResult(manifest);
}

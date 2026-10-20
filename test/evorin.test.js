import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accumulatePreferenceFeedback,
  analyzeVisualFallback,
  generateExportManifest,
  retrieveTaskPreferences,
  validateImageUpload,
  validateSocialContentPackage,
  validateStyleRecommendation
} from '../lib/evorin.js';

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('validates supported image signatures and rejects oversized or mismatched uploads', () => {
  const valid = validateImageUpload({ mimeType: 'image/jpeg', filename: 'look.jpg', bytes: jpeg }, { maxBytes: 10 });
  assert.equal(valid.ok, true);
  assert.equal(valid.signatureVerified, true);
  assert.equal(valid.sizeBytes, 4);

  const tooLarge = validateImageUpload({ mimeType: 'image/png', bytes: png }, { maxBytes: 4 });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.error.code, 'IMAGE_TOO_LARGE');

  const mismatch = validateImageUpload({ mimeType: 'image/png', bytes: jpeg });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, 'IMAGE_SIGNATURE_MISMATCH');
});

test('metadata visual fallback is explicit about not doing real vision', () => {
  const result = analyzeVisualFallback({
    filename: 'red-linen-jacket.webp',
    mimeType: 'image/webp',
    sizeBytes: 1200,
    metadata: { width: 800, height: 1000, orientation: 'portrait' }
  });
  assert.equal(result.mode, 'metadata-fallback');
  assert.equal(result.visionAvailable, false);
  assert.equal(result.isVisionAnalysis, false);
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.claims.dimensions, { width: 800, height: 1000 });
  assert.match(result.limitations[0], /not inspected/i);
});

test('task preference retrieval keeps styling and social scopes isolated and ranks task matches', () => {
  const preferences = [
    { id: 'social-1', scope: 'social', key: 'tone', value: 'warm', confidence: 0.99, evidenceCount: 5 },
    { id: 'style-global', scope: 'styling', key: 'palette', value: 'muted', confidence: 0.6, evidenceCount: 2 },
    { id: 'style-task', scope: 'styling', taskIds: ['look-1'], key: 'silhouette', value: 'relaxed', confidence: 0.7, evidenceCount: 2 }
  ];
  const result = retrieveTaskPreferences(preferences, { id: 'look-1', scope: 'styling', tags: ['outerwear'] });
  assert.deepEqual(result.map((item) => item.id), ['style-task', 'style-global']);
  assert.ok(result.every((item) => item.scope === 'styling'));
});

test('feedback needs distinct repeated evidence and does not cross scopes', () => {
  let state = { preferences: [], feedbackLedger: [] };
  const first = accumulatePreferenceFeedback(state, { scope: 'styling', preferenceId: 'p1', signal: 'accept', evidenceId: 'look-1' });
  assert.equal(first.entry.status, 'candidate');
  state = first.state;
  const duplicate = accumulatePreferenceFeedback(state, { scope: 'styling', preferenceId: 'p1', signal: 'accept', evidenceId: 'look-1' });
  assert.equal(duplicate.duplicate, true);
  const second = accumulatePreferenceFeedback(state, { scope: 'styling', preferenceId: 'p1', signal: 'accept', evidenceId: 'look-2' });
  assert.equal(second.entry.status, 'accepted');
  assert.equal(second.state.preferences[0].scope, 'styling');

  const social = accumulatePreferenceFeedback(second.state, { scope: 'social', preferenceId: 'p1', signal: 'accept', evidenceId: 'post-1' });
  assert.equal(social.entry.status, 'candidate');
  assert.equal(social.state.feedbackLedger.length, 2);
});

test('validates style and social output schemas and exports a portable manifest', () => {
  const style = validateStyleRecommendation({
    taskId: 'look-1', scope: 'styling', title: 'Soft structure', confidence: 0.8,
    recommendations: [{ category: 'silhouette', value: 'Relaxed shoulders', rationale: 'Keeps the outfit comfortable.' }]
  });
  assert.equal(style.ok, true);

  const social = validateSocialContentPackage({
    taskId: 'look-1', scope: 'social', platform: 'instagram', caption: 'A quiet layer for cooler days.',
    hashtags: ['#layering', '#style'], altText: 'A layered outfit in a neutral palette.'
  });
  assert.equal(social.ok, true);
  assert.equal(validateSocialContentPackage({ ...social.value, hashtags: ['style'] }).ok, false);

  const manifest = generateExportManifest({
    exportId: 'export-1', taskId: 'look-1', generatedAt: '2026-10-20T10:00:00.000Z',
    assets: [{ path: 'images/look.jpg', mimeType: 'image/jpeg', bytes: jpeg }],
    styleRecommendation: style.value,
    socialContentPackage: social.value
  });
  assert.equal(manifest.ok, true);
  assert.equal(manifest.manifestVersion, '1.0');
  assert.equal(manifest.outputs.styleRecommendation.scope, 'styling');
  assert.equal(manifest.outputs.socialContentPackage.scope, 'social');
  assert.equal(manifest.assets[0].path, 'images/look.jpg');
});

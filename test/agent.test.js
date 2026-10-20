import test from 'node:test';
import assert from 'node:assert/strict';
import { extractReminder, buildSkillEvidence, mcpTools } from '../lib/agent.js';

test('extracts a dated commitment with provenance', () => {
  const result = extractReminder({
    id: 'thread-1',
    body: 'Please upload the final project note by Friday, October 23 at 5:00 PM IST.'
  }, new Date('2026-10-20T09:00:00+05:30'));
  assert.equal(result.sourceThreadId, 'thread-1');
  assert.match(result.title, /upload the final project note/i);
  assert.equal(result.confidence, 0.94);
  assert.match(result.interpretation, /October 23/);
  assert.match(result.sourceQuote, /Please upload/);
});

test('lowers confidence when action has no reliable deadline', () => {
  const result = extractReminder({ id: 'thread-2', body: 'Can you send the eval matrix sometime soon?' });
  assert.equal(result.confidence, 0.72);
  assert.equal(result.dueAt, null);
  assert.match(result.reasoning, /ambiguous/);
});

test('maps completed work into explicit skill evidence', () => {
  const evidence = buildSkillEvidence({ title: 'Bring a retrieval failure mode', sourceQuote: 'Bring one failure mode from your RAG project.', confidence: 0.94 });
  assert.equal(evidence.skillId, 'skill-rag');
  assert.equal(evidence.confidence, 0.94);
  assert.match(evidence.evidence, /Completed/);
});

test('MCP surface is allowlisted and writes are visibly scoped', () => {
  assert.deepEqual(mcpTools.map((tool) => tool.name), [
    'search_threads', 'list_reminders', 'list_notes', 'get_skill_progress', 'complete_reminder'
  ]);
  assert.equal(mcpTools.find((tool) => tool.name === 'complete_reminder').readOnly, false);
  assert.ok(mcpTools.every((tool) => tool.description && !tool.description.includes('SQL')));
});

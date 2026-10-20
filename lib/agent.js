const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function findQuote(body) {
  const sentences = String(body || '').split(/(?<=[.!?])\s+/).map(clean).filter(Boolean);
  const candidate = sentences.find((sentence) => /\b(please|can you|bring|upload|send|reply|submit|finish|remember)\b/i.test(sentence));
  return candidate || sentences[0] || 'No source sentence found.';
}

function parseDate(body, now = new Date()) {
  const text = String(body || '').toLowerCase();
  const dateMatch = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
  let date;
  let label;
  if (dateMatch) {
    const year = Number(dateMatch[3] || now.getFullYear());
    date = new Date(year, MONTHS[dateMatch[1].toLowerCase()], Number(dateMatch[2]), 17, 0, 0);
    label = `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at 5:00 PM`;
  } else if (/\btomorrow\b/i.test(body)) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(17, 0, 0, 0);
    label = `Tomorrow at 5:00 PM`;
  } else if (/\b(thursday|friday|monday|tuesday|wednesday|saturday|sunday)\b/i.test(body)) {
    const dayName = text.match(/\b(thursday|friday|monday|tuesday|wednesday|saturday|sunday)\b/i)[1];
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName);
    date = new Date(now);
    const delta = ((target - date.getDay()) + 7) % 7 || 7;
    date.setDate(date.getDate() + delta);
    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    const hour = timeMatch ? Number(timeMatch[1]) + (timeMatch[3].toLowerCase() === 'pm' && Number(timeMatch[1]) < 12 ? 12 : 0) : 17;
    date.setHours(hour, timeMatch?.[2] ? Number(timeMatch[2]) : 0, 0, 0);
    label = `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${timeMatch ? ` at ${timeMatch[0]}` : ' at 5:00 PM'}`;
  }
  return date ? { date, label } : null;
}

function inferTitle(quote) {
  return clean(quote.replace(/^(hi\s+\w+[,;:]?\s*)/i, '').replace(/\b(please|can you)\b/i, '').replace(/[.?!]+$/, ''));
}

export function extractReminder(message, now = new Date()) {
  const body = clean(message?.body);
  const quote = findQuote(body);
  const parsed = parseDate(body, now);
  const hasAction = /\b(upload|send|submit|bring|reply|finish|complete|schedule|register|review|prepare|pay)\b/i.test(body);
  const confidence = parsed && hasAction ? 0.94 : hasAction ? 0.72 : 0.34;
  const dueDate = parsed?.date || null;
  return {
    title: inferTitle(quote),
    dueAt: dueDate ? dueDate.toISOString() : null,
    interpretation: parsed?.label || 'No reliable deadline found. Review before saving.',
    confidence,
    sourceQuote: quote,
    sourceThreadId: message?.id,
    reasoning: parsed ? 'Action language + explicit time signal found.' : hasAction ? 'Action language found, but date wording is ambiguous.' : 'No clear commitment signal found.'
  };
}

export function buildSkillEvidence(reminder, skill) {
  const text = `${reminder.title} completed from ${reminder.sourceQuote}`;
  const mapping = /rag|retrieval/i.test(text) ? 'skill-rag' : /upload|send|project|note/i.test(text) ? 'skill-communication' : 'skill-orchestration';
  return {
    skillId: skill?.id || mapping,
    evidence: `Completed: ${reminder.title}`,
    source: reminder.sourceQuote,
    confidence: Math.min(0.98, Math.max(0.62, reminder.confidence || 0.7))
  };
}

export const mcpTools = [
  { name: 'search_threads', description: 'Search the connected inbox by sender, subject, or body.', readOnly: true },
  { name: 'list_reminders', description: 'List reminders by lifecycle status.', readOnly: true },
  { name: 'list_notes', description: 'List personal notebook entries.', readOnly: true },
  { name: 'get_skill_progress', description: 'Read evidence-backed skill progress.', readOnly: true },
  { name: 'complete_reminder', description: 'Complete one reminder after explicit user confirmation.', readOnly: false }
];

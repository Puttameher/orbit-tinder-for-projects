const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function scoreProject(project, user) {
  const tags = new Set(project.tags || []);
  const interests = user.interests || [];
  const skills = user.skills || [];
  const needs = project.needs || [];
  const interestHits = interests.filter((interest) => [...tags].some((tag) => tag.includes(interest) || interest.includes(tag))).length;
  const skillHits = skills.filter((skill) => [...(project.stack || []), ...needs].some((item) => item.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(item.toLowerCase()))).length;
  const goalScore = clamp(interestHits / Math.max(1, interests.length) * 100);
  const skillScore = clamp(skillHits / Math.max(1, Math.min(skills.length, 3)) * 100);
  const availabilityScore = project.commitment?.includes('1–2') || project.commitment?.includes('2–3') ? 100 : 72;
  const stageScore = project.stage === 'building' || project.stage === 'prototype' ? 92 : 80;
  const score = Math.round(goalScore * .35 + skillScore * .25 + availabilityScore * .2 + stageScore * .2);
  return { score, goalScore: Math.round(goalScore), skillScore: Math.round(skillScore), availabilityScore, stageScore, interestHits, skillHits };
}

export function explainProjectFit(project, user) {
  const metrics = scoreProject(project, user);
  const shared = (project.tags || []).filter((tag) => (user.interests || []).some((interest) => tag.includes(interest) || interest.includes(tag)));
  const strengths = [
    shared.length ? `Shared interest in ${shared.slice(0, 2).join(' and ')}` : 'A project shape that expands your current orbit',
    metrics.skillHits ? `${metrics.skillHits} skill${metrics.skillHits === 1 ? '' : 's'} connect to the open roles` : 'A clear role to learn through',
    metrics.availabilityScore >= 90 ? 'The time commitment fits your open weekends' : 'The scope is visible enough to negotiate'
  ];
  const tradeoffs = [
    project.stage === 'concept' ? 'The idea is early, so the first milestone needs definition' : 'The project has momentum, so onboarding may be opinionated',
    project.needs?.includes('backend builder') && !(user.skills || []).includes('backend') ? 'Backend ownership is still an open question' : 'You will need to agree on what “done” means'
  ];
  return { ...metrics, strengths, tradeoffs, gaps: project.needs || [], confidence: Number((0.71 + metrics.score / 500).toFixed(2)), evidence: [{ label: 'interests', value: shared.join(', ') || 'adjacent interest' }, { label: 'commitment', value: project.commitment }, { label: 'stage', value: project.stage }] };
}

export function createRemixPlan(project, user) {
  return {
    id: `remix-${Date.now()}`,
    sourceProjectId: project.id,
    title: `${project.title} / your riff`,
    status: 'draft',
    preserve: `Keep the core promise: ${project.summary}`,
    change: `Add a sharper first-run experience shaped around your strengths in ${(user.skills || []).slice(0, 2).join(' and ')}.`,
    firstMilestone: `Ship a 7-day vertical slice: one user, one happy path, one honest outcome.`,
    risks: ['Scope could widen before the first user sees it.', 'The project needs a clear owner for the next decision.'],
    questions: ['What would make the first version feel unmistakably useful?', 'Which constraint should stay non-negotiable?'],
    createdAt: new Date().toISOString()
  };
}

export function draftIntroduction(project, fit, user) {
  return `Hey ${project.owner.name.split(' ')[0]}, I found ${project.title} through Riff. The ${fit.strengths[0].toLowerCase()} stood out to me. I work across ${(user.skills || []).slice(0, 2).join(' and ')} and have ${user.availability} open. Curious what the first milestone looks like from your side.`;
}

# Orbit Phase 0 architecture

## Current boundary

This milestone is a design preview only. The preview uses local mock data and browser state so it can be reviewed without credentials or external services. It contains no production database, no live recommendation model, and no claim that the sample score is a real prediction.

## Preview flow

```text
landing narrative
  → direction selector
  → opportunity sample
  → Orbit Lens interaction
  → analysis panel
  → dashboard preview
  → explicit design approval
```

The approval state is stored in `localStorage` under `orbit-preview-state`. The approval button is intentionally the final action in the preview. Production work should not begin until that state is reviewed by the owner in the conversation.

## Three visual directions

### A. Living Orb

Night observatory, acid lime signal, coral counterpoint, soft dimensional orb. Motion is radial and instrument-like.

### B. Intelligent Artifact (selected default)

Paper, cobalt, and copper. Orbit Lens becomes a precise geometric artifact with a folded-plane analysis state. Motion is measured, angular, and editorial.

The main application surface uses a darker artifact mode: a deep blue-black canvas, restrained glass navigation dock, a Tinder-like centered opportunity deck, two corner Lens instruments, and a procedural motion study in place of a static dashboard image.

### C. Organic Digital Companion

Plum, seafoam, and apricot. Orbit Lens becomes a restrained fluid organism with a curious, non-mascot presence. Motion is slower and more biological.

## Future production modules after approval

1. **Identity and profile:** authentication, CV upload, structured profile draft, corrections, GitHub consent.
2. **Opportunity ingestion:** authorized sources, normalization, provenance, freshness, deduplication.
3. **Retrieval:** profile and opportunity embeddings with metadata filters and pgvector.
4. **Ranking:** transparent hybrid baseline first, then versioned learning-to-rank experiments.
5. **Orbit Lens:** deterministic metrics plus validated LLM explanations grounded in evidence.
6. **Agents:** Opportunity Analyst, Skill Gap Planner, Project Architect, Team Formation Assistant.
7. **Feedback:** impressions, saves, dismissals, clicks, explicit corrections, and task outcomes.
8. **Evaluation:** time-based offline splits, NDCG@K, Precision@K, diversity, coverage, calibration.

## Production safety boundaries

- External content is data, not agent instructions.
- Numeric fit scores must come from documented features or validated model output.
- LLMs may explain and plan, but must not invent requirements or source facts.
- Agents may draft, but cannot apply, publish, contact, or change profile data without approval.
- CV and profile data need explicit ownership, deletion, retention, and access controls.
- Opportunity sources must respect API terms, quotas, robots policies, and provenance.

## Visual study boundary

The current dashboard “AI visual study” is a procedural canvas animation. It is intentionally labeled as generated/illustrative in the preview and does not claim to be a live video-generation model. After approval, it can be replaced by a provider-backed generation job with asset provenance and retryable background processing.

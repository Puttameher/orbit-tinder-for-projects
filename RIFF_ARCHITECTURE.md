# Riff architecture

Riff is a project-discovery product, not a generic social feed. The central loop is:

```text
declared context → project card → explicit signal → transparent fit read → reversible next move
```

## Product surfaces

### Public preview

The public site establishes the product thesis before asking for sign-in:

- Projects have a shape, tempo, and reason to exist.
- Discovery is one card at a time, not infinite scroll.
- The agent explains overlap and trade-offs, rather than judging people.
- Matches are mutual interest, not an automated commitment.

### Workspace

- **Discover:** Swipeable project deck with keyboard support.
- **Matches:** Mutual-interest projects with a fit summary.
- **Saved:** A shortlist for projects that are not an immediate yes.
- **Remixes:** Separate fork briefs generated from saved or matched projects.

## Domain model

The local demo uses `data/rally-state.json`, initialized from `data/rally-seed.json`.

```text
User
  ├─ skills, interests, availability, timezone
  ├─ SwipeDecision[]
  ├─ SavedProject[]
  └─ Match[]

Project
  ├─ owner, stage, stack, tags, needs, commitment, license
  └─ ProjectAsset[]

AgentRun
  ├─ type: fit | introduction
  ├─ evidence, score, confidence, model
  └─ createdAt

Remix
  ├─ sourceProjectId
  ├─ preserve, change, firstMilestone
  ├─ risks, questions
  └─ status: draft | approved | archived
```

## Agent boundaries

### Fit scorer

The numeric score is deterministic and inspectable. It uses:

- 35% goal and interest alignment
- 25% skill and open-role overlap
- 20% time commitment fit
- 20% project stage fit

The model must not become the hidden authority for the score.

### Fit explainer

The agent receives only declared project/profile context and returns:

- strengths
- trade-offs
- gaps
- confidence
- evidence labels

It must never infer protected traits, intelligence, personality, or socioeconomic status.

### Remix planner

The agent creates a separate fork brief with:

- what to preserve
- what to change
- first milestone
- risks
- open questions

It must never overwrite the source project.

### Introduction drafter

The agent may draft a first message. It cannot send it. The user reviews and edits it first.

## MVP API

```text
GET  /api/rally/state
POST /api/rally/swipe
POST /api/rally/save
POST /api/rally/projects/:id/fit
POST /api/rally/remix
POST /api/rally/introduction
```

## Production evolution

### Phase 1: hackathon demo

- Node monolith
- Seeded JSON state
- One local demo identity
- Deterministic transparent scoring
- Local agent runs and reversible mutations

### Phase 2: real product

- Supabase Auth or equivalent
- PostgreSQL with row-level security
- Private object storage for project assets
- Cursor-paginated discovery feed
- Realtime match notifications
- Background agent jobs with retries
- Moderation and reporting workflows

### Phase 3: agent platform

- Versioned fit and remix skills
- Evaluation fixtures for ranking quality
- Scoped MCP tools:
  - `list_projects`
  - `get_project_fit`
  - `create_remix_plan`
  - `draft_introduction`
- Explicit per-user consent and tool scopes
- Audit trail for every agent mutation

## Trust and safety

- Mutual interest is required for a match.
- Project visibility and license are explicit.
- Uploaded README text and project assets are untrusted content.
- Agent drafts never send messages or publish content.
- Fit evidence is visible and editable.
- Report, block, unmatch, deletion, and export are production requirements.

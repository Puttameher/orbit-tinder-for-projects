# Orbit Design Preview

Orbit is an AI-powered opportunity discovery platform for projects, research, open-source work, and career opportunities. The repository now includes the approved **Intelligent Artifact** design plus a functional local MVP slice for profile context, opportunity ranking, Orbit Lens analysis, swipe/save signals, matches, remixes, introduction drafts, and offline evaluation.

## See it

```text
http://localhost:4173
```

The main application is available at:

```text
http://localhost:4173/app
```

The landing page now includes **Open application** buttons that redirect directly to this working dashboard.

The default route is the public preview. **Intelligent Artifact (B)** is now the default direction. Compare all three directions, activate Orbit Lens, inspect the functional opportunity analysis, preview the dark application surface, then explicitly approve a direction.

## Preview flow

1. Review the cinematic landing page.
2. Switch between **Living Orb**, **Intelligent Artifact**, and **Organic Companion**.
3. Drag the opportunity card into Orbit Lens or press **Analyze with Lens**.
4. Inspect the sample analysis and dashboard preview.
5. Choose a direction, select elements to keep, and submit the explicit approval.

The working application now uses a cosmic-black research dashboard inspired by the supplied Orbit reference: fixed field navigation, top opportunity search, a luminous stacked card deck, Tinder-like pointer/touch swipes, Dismiss / Maybe / Save / Super-like actions, Orbit Lens analysis, and glass mobile navigation for Research papers, Projects, and Open source. The visual study is clearly labeled illustrative, not a live generated video model. Swipe/save actions and Lens analysis call the local Orbit API.

Use **Add an opportunity** in the sidebar to publish your own project, paper, or open-source idea. The form persists the listing locally, classifies it into one of the three sections, and makes it available to the local Orbit summary and fit-analysis agent.

## Run locally

Requirements: Node.js 22.15.0 or newer.

```bash
npm install
npm start
```

Preview selection and approval are stored in browser `localStorage`. Functional Orbit state is stored in `data/rally-state.json`, initialized from `data/rally-seed.json`, and ignored by git. Delete the state file to reset the demo account.

## Tests and checks

```bash
npm test
npm run check
```

The suite covers upload and legacy compatibility, Orbit profile/opportunity normalization, category filtering, user-created opportunities, deterministic local summaries, transparent ranking, fit explanations, proposal-only agent outputs, deterministic ranking evaluation, and remix/introduction safety.

## Docker

```bash
docker build -t orbit-preview .
docker run --rm -p 4173:4173 -v "${PWD}/data:/app/data" orbit-preview
```

Docker configuration is included for clean Linux rebuilds. Docker is not installed in the current development environment, so the container build must run in a Docker-enabled environment.

## Architecture

Read `ORBIT_ARCHITECTURE.md` for the functional MVP boundary, production architecture, ML pipeline, agent workflows, and approval gate.

## Functional Orbit API

```text
GET   /api/orbit/state
GET   /api/orbit/categories
GET   /api/orbit/opportunities?category=research-papers|projects|open-source
GET   /api/orbit/research-papers
GET   /api/orbit/projects
GET   /api/orbit/open-source
POST  /api/orbit/opportunities
GET   /api/orbit/opportunities/:id/summary
PATCH /api/orbit/profile
POST  /api/orbit/swipe
POST  /api/orbit/opportunities/:id/analyze
POST  /api/orbit/remix
POST  /api/orbit/introduction
POST  /api/orbit/feedback
POST  /api/orbit/evaluation
```

The ranking model is explicitly a transparent deterministic baseline, not trained ML. It exposes feature contributions and a model version. Opportunity categories are classified from declared metadata. `POST /api/orbit/opportunities` validates and persists a local-user collaboration listing in the ignored `data/rally-state.json` file. Summaries and fit explanations use a deterministic local template (`provider: local`, `offlineSafe: true`) and never require network access or claim an external model result. Agent outputs are grounded drafts and never send messages, publish work, or change profile context silently.

## Remaining production gaps

Authentication, multi-user ownership, private object storage, authorized opportunity ingestion, PostgreSQL/pgvector, background jobs, CV extraction, moderation, and a trained learning-to-rank model remain production follow-ups. The functional contracts are now in place so those pieces can be added without replacing the approved interaction design.

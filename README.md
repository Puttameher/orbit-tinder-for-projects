# Orbit Design Preview

Orbit is an AI-powered opportunity discovery platform for projects, research, open-source work, and career opportunities. This repository is currently at **Phase 0: Design Preview MVP**. It intentionally stops before production application implementation.

## See it

```text
http://localhost:4173
```

The default route is the public preview. Compare three distinct visual directions, activate Orbit Lens, inspect the sample opportunity analysis, preview the dashboard, then explicitly approve a direction.

## Preview flow

1. Review the cinematic landing page.
2. Switch between **Living Orb**, **Intelligent Artifact**, and **Organic Companion**.
3. Drag the opportunity card into Orbit Lens or press **Analyze with Lens**.
4. Inspect the sample analysis and dashboard preview.
5. Choose a direction, select elements to keep, and submit the explicit approval.

## Run locally

Requirements: Node.js 22.15.0 or newer.

```bash
npm install
npm start
```

Preview selection and approval are stored in browser `localStorage`. No backend configuration is required for the design preview.

## Tests and checks

```bash
npm test
npm run check
```

The existing test suite covers the earlier backend primitives. The preview itself is intentionally static/mock and clearly labeled as such.

## Docker

```bash
docker build -t orbit-preview .
docker run --rm -p 4173:4173 -v "${PWD}/data:/app/data" orbit-preview
```

Docker configuration is included for clean Linux rebuilds. Docker is not installed in the current development environment, so the container build must run in a Docker-enabled environment.

## Architecture

Read `ORBIT_ARCHITECTURE.md` for the design-preview boundary, the future production architecture, ML pipeline, agent workflows, and approval gate.

## Current scope

This is a standalone design preview. It does not implement production authentication, opportunity ingestion, real ML ranking, real AI analysis, CV processing, private object storage, or agent execution. Those are deliberately deferred until the owner approves a design direction.

# Evorin

Evorin is a visual-first personal preference engine. It learns from what a person chooses, edits, saves, and rejects, then uses that task-scoped taste memory for personal styling and social content creation.

## Current MVP

- Premium responsive workspace with Home, Style me, Create, My library, and My taste.
- JPEG, PNG, and WebP upload validation, private local persistence, previews, and removal-ready asset records.
- Personal styling workflow with occasion constraints, preference retrieval, grounded recommendation cards, feedback, saving, and export.
- Social content workflow with multiple image uploads, format and visual-direction controls, editable caption variants, feedback, saving, and export.
- Separate styling and social preference scopes.
- Repeated-evidence feedback ledger. One rejection does not permanently redefine taste.
- Inspectable preference engine with reset and edit controls.
- Portable JSON export manifest for approved outputs.
- Honest local-demo mode. Without a multimodal provider, the app does not pretend to inspect pixels. It uses validated asset metadata and explicit seeded taste memory. Provider interfaces can be added behind the server boundary.

## Run locally

Requirements: Node.js 22.15.0 or newer.

```bash
npm install
npm start
```

Open <http://localhost:4173>.

The app initializes `data/evorin-state.json` from `data/evorin-seed.json`. The state file is local and ignored by git. Delete it to reset the demo account.

## Test and checks

```bash
npm test
npm run check
```

The suite covers image validation, honest vision fallback, task-scoped preference retrieval, repeated-evidence personalization, output validation, export manifests, reminder compatibility, and MCP compatibility.

## Docker

```bash
docker build -t evorin .
docker run --rm -p 4173:4173 -v "${PWD}/data:/app/data" evorin
```

Docker is included for clean Linux rebuilds. The current development machine does not have Docker installed, so the container build must be executed in a Docker-enabled environment.

## Configuration

Copy `.env.example` to `.env` for local overrides. No credential is required for the self-contained demo. Set `AI_PROVIDER=remote` and provide `OPENAI_API_KEY` plus an optional `AI_VISION_MODEL` to enable the server-side multimodal adapter for styling and content creation. If the provider fails validation or is unavailable, the app falls back to its honest local-demo pipeline.

## API surface

```text
GET    /api/evorin/state
POST   /api/evorin/upload
POST   /api/evorin/style/recommend
POST   /api/evorin/content/create
POST   /api/evorin/feedback
PATCH  /api/evorin/preferences/:id
POST   /api/evorin/preferences/reset
POST   /api/evorin/save
POST   /api/evorin/export
```

The original TraceForm reminder and MCP routes remain available for compatibility, but the product surface now defaults to Evorin.

## Demo script

1. Open **Style me**, upload a real JPEG/PNG/WebP outfit photo, choose **College**, and click **Read my look**.
2. Inspect the preference trace and click **More like this**, then save or export the look.
3. Open **Create**, upload several photos, select **Instagram carousel**, and click **Compose the story**.
4. Review the caption package, edit it conceptually through the variants, and export the manifest.
5. Open **My taste** to inspect separate styling and social signals, edit one, or reset learned taste.

## Privacy and scope

This is a local MVP/demo. It does not implement production authentication, Supabase, object storage, PostgreSQL/pgvector, signed URLs, or direct social publishing yet. Uploaded image data is stored in the local JSON state file for demonstration. Before production, move media to private object storage, add authenticated ownership checks and row-level security, encrypt tokens, and use a provider-backed vision/generation adapter with validated structured output.

# TraceForm

TraceForm is a provenance-first personal agent for turning inbox signals into reviewable reminders, linked notes, and evidence-backed skill growth.

## What is included

- Gmail-style demo connector with a syncable inbox
- Local AI extraction pipeline for commitments, dates, confidence, and source quotes
- Review-first reminders with complete, snooze, and dismiss actions
- Personal notebook with links back to source threads
- Skill growth surface that turns completed work into explicit evidence
- Narrow MCP surface with read-only tools, scoped writes, and an audit trail
- Browser notification support and a local JSON persistence layer

## Run locally

Requirements: Node.js 22.15.0 or newer.

```bash
npm install
npm start
```

Open <http://localhost:4173>.

The demo is self-contained and works without a network connection or API key. To use an OpenAI-compatible extraction provider, copy `.env.example` to `.env`, set `AI_PROVIDER=remote`, `OPENAI_API_KEY`, and optionally `AI_BASE_URL` and `AI_MODEL`. Email content is treated as untrusted input and is never allowed to select tools.

## Test and check

```bash
npm test
npm run check
```

The test suite exercises extraction, confidence handling, MCP tool allowlisting, reminder lifecycle, and note persistence without network access.

## Docker

```bash
docker build -t traceform .
docker run --rm -p 4173:4173 -v "${PWD}/data:/app/data" traceform
```

The app binds to `0.0.0.0` inside the container and keeps local state in `data/state.json`. Never expose the MCP write tools to the public internet without adding authentication and TLS.

## MCP

The demo exposes `GET /api/mcp/tools` and `POST /api/mcp/call`. The UI includes a safe, local simulator for the final demo. Available tools are `search_threads`, `list_reminders`, `list_notes`, `get_skill_progress`, and the explicitly scoped write `complete_reminder`. Every call is added to the in-app audit log.

## Demo script

1. Click **Connect Gmail** and **Sync now**.
2. Open the scholarship email and click **Run agent extraction**.
3. Approve the proposed reminder after inspecting its quote and confidence.
4. Add a personal note from the same thread.
5. Complete the reminder and open **Skill growth** to see the evidence chain.
6. Open **MCP bridge**, run `search_threads`, and show the audit entry.

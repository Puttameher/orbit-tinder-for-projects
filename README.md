# Riff

Riff is a premium project-discovery workspace for people who make things. It combines Tinder-like project discovery with transparent fit analysis, mutual matches, saved shortlists, remix briefs, and agent-drafted introductions.

## See it

```text
http://localhost:4173
```

The default route is the public preview. Click **Enter workspace** or **Explore the orbit** to open the product dashboard.

## Demo flow

1. Land on the public Riff preview and scroll through the product thesis.
2. Enter the workspace.
3. Use the project deck to pass, save, or like projects.
4. Click **Read this project** to get an evidence-backed fit read.
5. Like a reciprocal project to trigger the mutual match animation.
6. Open the agent result and create a separate remix brief.
7. Draft an introduction. It is editable and never sent automatically.
8. Explore Matches, Saved, and Remixes from the sidebar.

Keyboard shortcuts in Discover:

- `←` pass
- `Space` save
- `→` like

## Run locally

Requirements: Node.js 22.15.0 or newer.

```bash
npm install
npm start
```

The app initializes `data/rally-state.json` from `data/rally-seed.json`. Delete the state file to reset the local demo account. The state file is ignored by git.

## Tests and checks

```bash
npm test
npm run check
```

The test suite covers the original Evorin primitives plus Riff's bounded fit scoring, evidence-backed explanations, remix isolation, and draft-only introduction behavior.

## Docker

```bash
docker build -t riff .
docker run --rm -p 4173:4173 -v "${PWD}/data:/app/data" riff
```

Docker configuration is included for clean Linux rebuilds. Docker is not installed in the current development environment, so the container build must run in a Docker-enabled environment.

## Architecture

Read `RIFF_ARCHITECTURE.md` for product domains, entity model, agent boundaries, API routes, trust constraints, and the evolution path toward PostgreSQL, background jobs, and scoped MCP tools.

## Current scope

This is a local demo/MVP. It does not yet implement production authentication, multi-user realtime collaboration, private object storage, moderation queues, or Riff-specific MCP tools. The UI and API are structured so those boundaries can be added without replacing the product concept.

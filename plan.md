# Notemem MVP Implementation Plan

## Phase 1: Core Backend & Data Model (Days 1-3)
**Goal:** Establish the fundamental room and pad mechanics.
- [ ] **Scaffold Project:** Initialize Cloudflare Workers project with `wrangler`, TypeScript, and Hono.
- [ ] **Durable Object Setup:** Create the `Room` Durable Object. Set up SQLite schema (rooms, pads, revisions).
- [ ] **Routing & Auth:** Implement route matching `/r/{roomId}/{secret}`. Add logic to hash secrets and verify read/write access.
- [ ] **Pad CRUD APIs:** Implement core HTTP endpoints:
  - `POST /api/rooms` (Create room, generate secrets)
  - `GET /r/.../pads/{name}` (Read pad)
  - `PUT /r/.../pads/{name}` (Replace pad, checking `If-Match` header)
  - `POST /r/.../pads/{name}/append` (Append text)
  - `DELETE /r/.../pads/{name}` (Delete pad)
- [ ] **Testing:** Write Vitest tests against the Worker and Durable Object for concurrency and validation.

## Phase 2: Agent Tooling & Expiry (Days 4-5)
**Goal:** Make the service usable for AI agents directly and add cleanup logic.
- [x] **Agent Instruction Page:** Return a self-describing markdown page on `GET /r/{roomId}/{secret}` explaining the API to agents.
- [x] **MCP Integration:** Add an MCP server endpoint at `/mcp/{roomId}/{secret}` wrapping the core Pad CRUD APIs into MCP tools (`list_pads`, `read_pad`, `write_pad`, etc.).
- [x] **History & Limits:** Implement revision history logic (keep last N changes) and byte counters (enforce 256KB/pad limits).
- [x] **Inactivity Expiry:** Set up a Durable Object alarm to delete the room if unaccessed for 30 days.

## Phase 3: Frontend Web UI (Days 6-8)
**Goal:** Provide a seamless web experience for human users.
- [x] **Frontend Scaffold:** Initialize a Preact + Vite project in the `/web` directory.
- [x] **UI Layout:** Build a layout to show the room URL, a sidebar for pads, and an editor area.
- [x] **Read/Write Operations:** Wire up API calls to fetch pads, view history, edit, and save.
- [x] **Polling Mechanism:** Implement short-polling to automatically refresh the view if an agent updates the pad in the background.
- [x] **Markdown Rendering:** Integrate `marked` and `DOMPurify` to safely render markdown content in the UI.

## Phase 4: Security, Safety & Final Polish (Days 9-10)
**Goal:** Secure the application against abuse and deploy.
- [ ] **Rate Limiting:** Implement IP-based and Room-based rate limits in the edge worker to prevent abuse.
- [ ] **Headers:** Ensure `noindex`, `nosniff`, and secure CSP headers are applied.
- [ ] **Static Asset Serving:** Configure the Cloudflare Worker to serve the Preact frontend static assets.
- [ ] **End-to-End Testing:** Run integration tests with a live agent (using MCP and plain HTTP) to ensure it works smoothly.
- [ ] **Deployment:** Deploy to Cloudflare using GitHub Actions.

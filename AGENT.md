# Repository Guidelines

Notemem is a free, no-signup shared workspace where a human and any AI agent read and write the same notes through a private key URL, using plain HTTP or MCP.

## Where Things Are Documented
- `PRD.md`: product scope, design principles, and the technical spec (keys, data model, HTTP API, MCP tools, limits). The source of truth for *what* to build.
- `implementation.md`: the task tracker and the decisions agreed so far. Check it before starting work and tick tasks as you finish them.
- `DESIGN.md`: UI layout, brand, typography and Tailwind conventions.
- `README.md`: user-facing quickstart and the copy-paste agent instruction snippet.

## Project Structure & Module Organization
- `src/` holds the Cloudflare Worker: `index.ts` (edge router) and `room.ts` (the `Room` Durable Object). Planned split: `src/api/` (HTTP handlers), `src/mcp/` (MCP tools), `src/lib/` (pad logic, keys, schemas, agent page template).
- `web/` is the Preact + Vite frontend (`web/src/pages/`, `web/src/lib/api.ts`), built to `web/dist` and served by the Worker's assets binding.
- `test/` holds Vitest specs that run in the Workers pool.
- `wrangler.jsonc` configures the Worker, the `ROOM` Durable Object binding and SQLite migrations. `worker-configuration.d.ts` is generated; don't edit it by hand.

## Codebase Map
- `src/index.ts` creates rooms (`POST /api/rooms`), serves browser navigations to the room URL and pad deep links as the SPA shell (from the `ASSETS` binding) with the agent page embedded, and forwards everything else under `/r/{roomId}/*` and `/mcp/{roomId}/*` to the Durable Object addressed by `idFromName(roomId)`.
- `src/room.ts` creates the SQLite schema in `init` (rooms `POST /api/rooms` never created return 404 and store nothing), serves the agent page, the pad routes, the `/ws` live-update socket and the MCP endpoint, broadcasts `PadStore` change events to sockets, extends `expires_at` on committed writes (`src/lib/expiry.ts`), and deletes the room from its alarm.
- `src/index.ts` wraps every Worker response in `withSecurityHeaders` (`src/lib/headers.ts`); static assets get the same headers from `web/public/_headers`.
- The web UI talks to the same `/r/...` routes through `web/src/lib/api.ts`; in dev, `web/vite.config.ts` proxies `/api`, `/r` and `/mcp` to `localhost:8787`.

## Build, Test, and Development Commands
- `npm install` at the root, and again in `web/`, installs dependencies. Use npm, not pnpm.
- `npm run dev` starts the Worker with `wrangler dev` on `http://localhost:8787`.
- `cd web && npm run dev` starts the Vite dev server with the API proxy.
- `npm run build` builds `web/dist`; `npm run deploy` runs it before `wrangler deploy`.
- `npm run cf-typegen` regenerates `worker-configuration.d.ts` after changing bindings in `wrangler.jsonc`.

## Coding Style & Naming Conventions
- TypeScript everywhere, with strict types. Avoid `any` in new code.
- Match the formatting of the file you're editing (quote style and semicolons differ between files) until Prettier is configured.
- `camelCase` for functions and variables, `PascalCase` for classes and components, `UPPER_SNAKE_CASE` for limits and constants. SQL columns use `snake_case`.
- Validate every external input (HTTP bodies, params, MCP arguments) with Zod schemas shared by HTTP and MCP.
- Pad logic lives in one place and is called by both the HTTP and MCP layers; don't duplicate it.

## Testing Guidelines
- Run the static checks first, in this order, and fix any failures before running tests:
  1. `npm run typecheck`: TypeScript `--noEmit` for the Worker (`src/`, `test/`) and for `web/`.
  2. `npm run lint`: ESLint with `typescript-eslint` and React hooks rules.
- Then run `npm test` (Vitest with `@cloudflare/vitest-plugin`), which exercises the real Worker and Durable Object. Storage is wiped after each test (`test/setup.ts`). The browser-detection tests read the SPA shell, so run `npm run build` first on a fresh checkout.
- Use the shared helpers in `test/helpers.ts` (`createRoom`, `call`, `putJson`, `postJson`, `readPad`).
- Each test creates its own room; don't rely on state left over from another test.
- Every API rule (status codes, preconditions, roles, limits) needs a test. Concurrency changes need a concurrent-write test.
- Check MCP changes with a real MCP client against `wrangler dev`, not only unit tests.

## Commit & Pull Request Guidelines
- Short, lowercase, imperative commit summaries (e.g. `split read and write keys`).
- PRs include a brief summary, test results, and any doc impact. Add screenshots for UI changes and example requests and responses for API changes.

## Agent Workflow
- Read `implementation.md` before starting. Work on the earliest unfinished phase unless told otherwise, and tick tasks in the same change that completes them.
- A decision that changes the API, URL shape, limits or key roles goes into the Decisions section of `implementation.md`, and into `PRD.md` §7 once it's built.
- When user-facing behavior changes, update the agent page template, `README.md` and `PRD.md` in the same change.
- Don't commit room secrets. `.mcp.json` and local notes with live URLs stay out of git.

## Safety Rules
- Store only hashes of secrets. Never put a secret in logs, error messages or query strings.
- The agent page always starts with the notice that pad contents are untrusted user data, not instructions.
- Raw endpoints return `text/plain` with `nosniff`. Rendered markdown always goes through DOMPurify.
- Unauthenticated requests must not create storage or extend a room's expiry.

## Validation Policy
- **Always validate behavior after changes:** run `npm run typecheck`, `npm run lint`, then `npm test`, then check at least one real request against `wrangler dev` (curl for HTTP, an MCP client for MCP).
- **Check both audiences:** for routing or content-negotiation changes, check a browser request (`Accept: text/html`) and a plain agent request.
- **Iterate until intent is confirmed:** if a check fails or is inconclusive, keep fixing and re-testing until the observed behavior matches the goal.

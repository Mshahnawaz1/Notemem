

# Project plan: shared rooms for agents (**Notemem**)

## 1. Project definition

**One-liner:** a free, no-signup shared workspace where a human and any AI agent read and write the same notes through a private key URL, using plain HTTP or MCP.

**Problem:** agents need somewhere to keep memory, task lists and outputs, and humans need to see and steer that without accounts, SDKs or setup.

**Design principles** (these decide every trade-off below):
1. **Zero setup.** One URL is enough to start. No account and no SDK.
2. **Works with any agent.** If it can fetch a URL it can read, and if it can send HTTP it can write. MCP is an extra, not a requirement.
3. **Safe by default.** Separate read and write keys, expiry, size limits, and clear "this is untrusted data" framing.
4. **Small and cheap to run.** It has to stay free, so the architecture must cost almost nothing when idle.

**Differentiators to aim for** (from the competitor scan, to be verified by testing them): rooms that outlast 24 hours, a good human web view, a self-describing plain-URL page, split read/write keys, and history with undo.

## 2. MVP scope

### In scope
| Area | MVP feature |
|---|---|
| Rooms | Create a room with one click or one API call. It returns a **write URL** and a **read-only URL**. |
| Pads | A room holds named pads (markdown or plain text), up to 20 per room. |
| Operations | List, read, replace (with version check), append, delete. |
| Agent page | `GET` on the room URL returns a self-describing markdown page: contents, plus how to read and write. |
| Web UI | View and edit pads, with auto-refresh by polling. |
| MCP | A remote MCP endpoint with about six tools wrapping the same operations. |
| History | Keep the last N revisions per pad, viewable and restorable. |
| Safety | Hashed keys, rate limits, size caps, inactivity expiry, `noindex`, no key logging. |
| Abuse | A bot check on room creation, and a simple delete/report path. |

### Out of scope for MVP
Accounts and logins, semantic or vector search, end-to-end encryption, admin keys, file uploads, real-time WebSockets (polling first), custom domains, a public room directory, rich-text editing, and human-challenge bot checks like Turnstile.

### Success criteria
- An agent with no MCP can use a room from only a pasted URL plus one sentence of instruction.
- An agent with MCP can connect in under a minute.
- You use it daily with a real agent for a week without hitting a blocker.
- Two agents writing to the same pad at once don't corrupt data.

## 3. Architecture

```
 Agent (HTTP)      Agent (MCP)       Human (browser)
      │                 │                  │
      └──────┬──────────┴──────────────────┘
             ▼
   ┌───────────────────────┐
   │  Edge Worker (router) │  rate limit · bot check · routing · static UI
   └──────────┬────────────┘
              ▼   one instance per room (addressed by room ID)
   ┌───────────────────────┐
   │   Room object         │  key check · pad logic · history · expiry timer
   │   + embedded SQLite   │
   └───────────────────────┘
```

**Core idea:** each room is an isolated, single-threaded unit with its own small database. That removes most concurrency bugs, because all writes to a room are processed one at a time. It also scales to many rooms with no central database to run.

### Key design
- URL shape: `/r/{roomId}/{secret}`.
- `roomId` is a short random ID used only for routing, and it isn't a secret.
- `secret` is at least 128 bits of random data. Each room has a **read** secret and a **write** secret (and optionally an admin secret for delete and key rotation).
- Only **hashes** of the secrets are stored. Which hash matches decides the role.
- The raw secrets are shown once, at creation.
- Because the room ID routes directly, there is no global key-lookup table.

### Data model (inside each room)
- `room`: created time, last active time, expiry time, secret hashes, byte counter.
- `pads`: name, content, version number, updated time.
- `revisions`: pad, version, content, timestamp, source (api, mcp or web).

### HTTP API
| Method and path | Purpose |
|---|---|
| `POST /api/rooms` | Create a room, returning the URLs and secrets |
| `GET /r/{id}/{secret}` | Content negotiation: markdown or plain text for agents, HTML for browsers |
| `GET /r/.../pads/{name}` | Read a pad (raw text) |
| `PUT /r/.../pads/{name}` | Replace, requiring a version via `If-Match` |
| `POST /r/.../pads/{name}/append` | Append, never conflicts |
| `DELETE /r/.../pads/{name}` | Delete (write key) |
| `GET /r/.../pads/{name}/history` | List revisions |
| `/mcp/{id}/{secret}` | MCP over streamable HTTP |

### MCP tools
`list_pads`, `read_pad`, `write_pad`, `append_pad`, `delete_pad`, `get_history`.

### Concurrency rule
`append` is the recommended default and never conflicts. `replace` fails with a clear "version changed, re-read" error if another writer got there first, and the error text tells the agent what to do.

### Safety design
- **Prompt injection:** the agent-facing page leads with a fixed notice that pad contents are user-supplied data, not instructions. Read-only keys are encouraged when an agent only needs to read.
- **Leak prevention:** `Referrer-Policy: no-referrer`, `noindex`, no secrets in logs or error messages, and secrets in the path rather than the query string.
- **XSS:** raw endpoints return plain text with `nosniff`. The web UI sanitizes rendered markdown and uses a strict Content-Security-Policy.
- **Limits (starting values to tune):** 256 KB per pad, 2 MB per room, 20 pads, 50 revisions per pad, about 60 requests per minute per room.
- **Expiry:** rooms are deleted after 30 days of inactivity, with a countdown shown in the UI and API.
- **Abuse:** a bot check (a CAPTCHA alternative) on room creation, per-IP creation limits, a report/delete route, and a global kill switch.

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | One language for API, MCP and UI, with strong types |
| Runtime and hosting | **Cloudflare Workers** | Near-zero idle cost, global, no servers to run |
| Per-room state | **Durable Objects with SQLite storage** | A natural fit for one-room-one-actor, built-in transactions, and alarms for expiry |
| Router | **Hono** | Small, fast, runs on Workers |
| MCP | **Official MCP TypeScript SDK** (or Cloudflare's agents library) | Standard streamable-HTTP transport |
| Validation | **Zod** | Shared schemas for HTTP and MCP |
| Frontend | **Preact or Svelte + Vite** | Small bundle, served from the same Worker |
| Markdown | **marked + DOMPurify** | Safe rendering |
| Editor | Plain `<textarea>` first, CodeMirror later | Keep MVP simple |
| Bot check | **Rate Limits** | Simple and agent-friendly for MVP |
| Tests | **Vitest** with the Workers test pool | Runs against real Worker and Durable Object behavior |
| Tooling | **Wrangler**, GitHub Actions, ESLint, Prettier | Standard deploy and CI |

I'm working from memory on Cloudflare's current free-tier limits and which Durable Object storage types the free plan allows. Check the current pricing and limits pages before committing.

**Alternative stack** if you'd rather avoid Cloudflare: Node.js with Fastify and SQLite on a small VPS (or Fly.io). It is simpler to reason about and fully portable, but you run the server, handle scaling and backups yourself, and cost doesn't drop to zero when idle.

## 5. Suggested repo layout
```
notemem/
  src/
    worker.ts        # entry, routing, rate limits
    room.ts          # Durable Object: auth, pads, history, expiry
    api/             # HTTP handlers
    mcp/             # MCP server + tools
    lib/             # keys, hashing, limits, markdown page template
  web/               # frontend (Vite)
  test/
  wrangler.toml
  README.md          # includes the copy-paste agent instruction snippet
```

## 6. Build plan

| Phase | Deliverable | Rough effort |
|---|---|---|
| 1. Core | Create room, key hashing, pad read/replace/append, version checks, tests | 2–3 days |
| 2. Agent page | Self-describing markdown page, plain-text endpoints, copy-paste prompt snippet | 1 day |
| 3. Web UI | List, view, edit, polling, copy-key buttons | 2–3 days |
| 4. MCP | Tools wrapping the same operations; test with a real MCP client | 1–2 days |
| 5. Safety | Limits, expiry alarm, Turnstile, headers, report/delete | 2 days |
| 6. Dogfood and harden | Use with your own agents for a week, fix rough edges | ongoing |

These are my estimates for one developer, not measured numbers. Total is roughly two weeks part-time to a usable MVP.

## 7. Decisions (Resolved)

1. **Hosting:** Cloudflare Workers and Durable Objects.
2. **Expiry:** 30 days of inactivity is accepted.
3. **Key roles:** Read and Write keys only for MVP.
4. **Name:** **Notemem**.
5. **Frontend:** Preact + Vite.
6. **Bot Check:** Rate limits only for MVP.
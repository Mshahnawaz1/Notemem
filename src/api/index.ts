import { Hono } from "hono";
import { renderAgentPage } from "../lib/agentPage";
import { redactSecrets } from "../lib/keys";
import type { PadStore } from "../lib/pads";
import type { McpHandler } from "../mcp/handler";
import { authenticate } from "./auth";
import type { RoomEnv } from "./auth";
import { registerPadRoutes } from "./pads";

export interface RoomAppDeps {
  sql: SqlStorage;
  store: PadStore;
  mcp: McpHandler;
  /** When the room expires, in ms since the epoch, or null if no expiry is scheduled. */
  expiresAt: () => Promise<number | null>;
  /** Hands the server end of a new socket to the Durable Object's hibernation API. */
  acceptWebSocket: (socket: WebSocket) => void;
}

/** The Hono app inside a room's Durable Object: agent page, pad routes, live updates and MCP. */
export function createRoomApp(deps: RoomAppDeps): Hono<RoomEnv> {
  const app = new Hono<RoomEnv>();

  // `/x/*` also matches `/x`, so this covers the agent page too.
  app.use("/r/:roomId/:secret/*", authenticate(deps.sql));
  app.use("/mcp/:roomId/:secret", authenticate(deps.sql));

  app.get("/r/:roomId/:secret", async (c) => {
    const page = renderAgentPage({
      origin: new URL(c.req.url).origin,
      roomId: c.req.param("roomId"),
      secret: c.req.param("secret"),
      role: c.get("role"),
      pads: deps.store.list(),
      expiresAt: await deps.expiresAt(),
    });
    return c.text(page, 200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
  });

  // Live updates for the web UI: the room pushes `{pad, version, deleted?}` after every write.
  app.get("/r/:roomId/:secret/ws", (c) => {
    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
      return c.json({ error: "This endpoint only accepts WebSocket connections (Upgrade: websocket)." }, 426);
    }
    const pair = new WebSocketPair();
    deps.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  });

  registerPadRoutes(app, deps.store);

  // Exactly one MCP URL per key; subpaths such as `/sse` are 404.
  app.all("/mcp/:roomId/:secret", (c) => deps.mcp(c.req.raw, c.get("role")));

  app.onError((error, c) => {
    // Error text can quote the request URL, which holds the secret.
    console.error(JSON.stringify({ error: redactSecrets(error.message) }));
    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}

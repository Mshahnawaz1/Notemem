import { Hono } from "hono";
import { renderAgentPage } from "../lib/agentPage";
import type { PadStore } from "../lib/pads";
import type { McpHandler } from "../mcp/handler";
import { authenticate } from "./auth";
import type { RoomEnv } from "./auth";
import { registerPadRoutes } from "./pads";

/** The Hono app inside a room's Durable Object: agent page, pad routes and MCP. */
export function createRoomApp(deps: { sql: SqlStorage; store: PadStore; mcp: McpHandler }): Hono<RoomEnv> {
  const app = new Hono<RoomEnv>();

  // `/x/*` also matches `/x`, so these cover the agent page and the bare MCP URL.
  app.use("/r/:roomId/:secret/*", authenticate(deps.sql));
  app.use("/mcp/:roomId/:secret/*", authenticate(deps.sql));

  app.get("/r/:roomId/:secret", (c) => {
    const page = renderAgentPage({
      origin: new URL(c.req.url).origin,
      roomId: c.req.param("roomId"),
      secret: c.req.param("secret"),
      role: c.get("role"),
    });
    return c.text(page, 200, { "Content-Type": "text/markdown" });
  });

  registerPadRoutes(app, deps.store);

  app.all("/mcp/:roomId/:secret/*", (c) => deps.mcp(c.req.raw, c.get("role")));

  app.onError((error, c) => {
    console.error(JSON.stringify({ error: error.message }));
    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}

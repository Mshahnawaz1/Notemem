import type { MiddlewareHandler } from "hono";
import { resolveRole } from "../lib/keys";
import type { Role } from "../lib/keys";

export type RoomEnv = { Bindings: CloudflareBindings; Variables: { role: Role } };

/** Resolves the secret in the path to a role, or rejects the request with 401. */
export function authenticate(sql: SqlStorage): MiddlewareHandler<RoomEnv> {
  return async (c, next) => {
    const role = await resolveRole(sql, c.req.param("secret") ?? "");
    if (!role) {
      await discardBody(c.req.raw);
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("role", role);
    await next();
  };
}

export const requireWrite: MiddlewareHandler<RoomEnv> = async (c, next) => {
  if (c.get("role") !== "write") {
    await discardBody(c.req.raw);
    return c.json({ error: "This URL is read-only. Use the room's write URL to change pads." }, 403);
  }
  await next();
};

/** Reads an unused body to the end; rejecting without it makes the runtime log "Can't read from request stream". */
export async function discardBody(request: Request): Promise<void> {
  if (request.body) await request.arrayBuffer();
}

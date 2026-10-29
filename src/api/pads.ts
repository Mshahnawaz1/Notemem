import type { Context, Hono } from "hono";
import type { z } from "zod";
import type { PadStore, WriteResult } from "../lib/pads";
import { appendBodySchema, describeIssue, ifMatchSchema, padNameSchema, replaceBodySchema } from "../lib/schemas";
import type { Source } from "../lib/schemas";
import { requireWrite } from "./auth";
import type { RoomEnv } from "./auth";

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

function badRequest(c: Context<RoomEnv>, message: string): Response {
  return c.json({ error: message }, 400);
}

function parsePadName(c: Context<RoomEnv>): Parsed<string> {
  const result = padNameSchema.safeParse(c.req.param("name"));
  if (!result.success) return { ok: false, response: badRequest(c, describeIssue(result.error)) };
  return { ok: true, value: result.data };
}

async function parseJsonBody<T>(c: Context<RoomEnv>, schema: z.ZodType<T>): Promise<Parsed<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: badRequest(c, "Request body must be valid JSON.") };
  }
  const result = schema.safeParse(body);
  if (!result.success) return { ok: false, response: badRequest(c, describeIssue(result.error)) };
  return { ok: true, value: result.data };
}

/** The web UI marks its writes; anything else over HTTP counts as the API. */
function requestSource(c: Context<RoomEnv>): Source {
  return c.req.header("X-Notemem-Source") === "web" ? "web" : "api";
}

function writeResponse(c: Context<RoomEnv>, result: WriteResult): Response {
  if (result.ok) return c.json({ success: true, version: result.version });
  switch (result.error) {
    case "not_found":
      return c.json({ error: "Pad not found" }, 404);
    case "conflict":
      return c.json(
        {
          error: `Conflict: the pad is now at version ${result.currentVersion}. Re-read the pad, then retry with If-Match: ${result.currentVersion}.`,
          currentVersion: result.currentVersion,
        },
        409
      );
    case "too_large":
      return c.json({ error: `Pad exceeds the ${result.limit / 1024} KB limit` }, 413);
    case "pad_limit":
      return c.json({ error: `Room has reached the maximum of ${result.limit} pads` }, 403);
  }
}

export function registerPadRoutes(app: Hono<RoomEnv>, store: PadStore): void {
  const base = "/r/:roomId/:secret/pads";

  app.get(base, (c) => c.json({ pads: store.list() }));

  app.get(`${base}/:name/history`, (c) => {
    const name = parsePadName(c);
    if (!name.ok) return name.response;
    return c.json({ revisions: store.history(name.value) });
  });

  app.get(`${base}/:name`, (c) => {
    const name = parsePadName(c);
    if (!name.ok) return name.response;
    const pad = store.read(name.value);
    if (!pad) return c.json({ error: "Pad not found" }, 404);
    return c.json(pad);
  });

  app.put(`${base}/:name`, requireWrite, async (c) => {
    const name = parsePadName(c);
    if (!name.ok) return name.response;
    const ifMatchHeader = c.req.header("If-Match");
    let expectedVersion: number | undefined;
    if (ifMatchHeader !== undefined) {
      const ifMatch = ifMatchSchema.safeParse(ifMatchHeader);
      if (!ifMatch.success) return badRequest(c, describeIssue(ifMatch.error));
      expectedVersion = ifMatch.data;
    }
    const body = await parseJsonBody(c, replaceBodySchema);
    if (!body.ok) return body.response;
    return writeResponse(c, store.replace(name.value, body.value.content, requestSource(c), expectedVersion));
  });

  app.post(`${base}/:name/append`, requireWrite, async (c) => {
    const name = parsePadName(c);
    if (!name.ok) return name.response;
    const body = await parseJsonBody(c, appendBodySchema);
    if (!body.ok) return body.response;
    return writeResponse(c, store.append(name.value, body.value.text, requestSource(c)));
  });

  app.delete(`${base}/:name`, requireWrite, (c) => {
    const name = parsePadName(c);
    if (!name.ok) return name.response;
    store.delete(name.value);
    return c.json({ success: true });
  });
}

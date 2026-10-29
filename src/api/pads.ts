import type { Context, Hono } from "hono";
import type { z } from "zod";
import { readSecretFor } from "../lib/keys";
import type { Expected, Pad, PadStore, WriteResult } from "../lib/pads";
import {
  appendBodySchema,
  describeIssue,
  ifMatchSchema,
  ifNoneMatchSchema,
  padNameSchema,
  replaceBodySchema,
} from "../lib/schemas";
import type { Source } from "../lib/schemas";
import { discardBody, requireWrite } from "./auth";
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

/**
 * Reads a write body. `text/plain` (or any `text/*`, or no type) is the text itself;
 * `application/json` is an object whose `field` holds it.
 */
async function parseWriteBody<T>(c: Context<RoomEnv>, schema: z.ZodType<T>, pick: (body: T) => string): Promise<Parsed<string>> {
  const type = (c.req.header("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (type === "" || type.startsWith("text/")) return { ok: true, value: await c.req.text() };
  if (type !== "application/json" && !type.endsWith("+json")) {
    const response = c.json({ error: "Unsupported Content-Type. Send the text as text/plain, or JSON as application/json." }, 415);
    return { ok: false, response: await rejectUnread(c, response) };
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: badRequest(c, "Request body must be valid JSON.") };
  }
  const result = schema.safeParse(body);
  if (!result.success) return { ok: false, response: badRequest(c, describeIssue(result.error)) };
  return { ok: true, value: pick(result.data) };
}

/** Turns `If-Match` / `If-None-Match` into what the store expects to find. */
function parsePrecondition(c: Context<RoomEnv>): Parsed<Expected> {
  const ifMatch = c.req.header("If-Match");
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifMatch !== undefined && ifNoneMatch !== undefined) {
    return { ok: false, response: badRequest(c, "Send either If-Match (to replace) or If-None-Match: * (to create), not both.") };
  }
  if (ifMatch !== undefined) {
    const result = ifMatchSchema.safeParse(ifMatch);
    if (!result.success) return { ok: false, response: badRequest(c, describeIssue(result.error)) };
    return { ok: true, value: result.data };
  }
  if (ifNoneMatch !== undefined) {
    const result = ifNoneMatchSchema.safeParse(ifNoneMatch);
    if (!result.success) return { ok: false, response: badRequest(c, describeIssue(result.error)) };
    return { ok: true, value: "new" };
  }
  return { ok: true, value: undefined };
}

/** For a write rejected before its body is read; see `discardBody`. */
async function rejectUnread(c: Context<RoomEnv>, response: Response): Promise<Response> {
  await discardBody(c.req.raw);
  return response;
}

/** The web UI marks its writes; anything else over HTTP counts as the API. */
function requestSource(c: Context<RoomEnv>): Source {
  return c.req.header("X-Notemem-Source") === "web" ? "web" : "api";
}

function etag(version: number): string {
  return `"${version}"`;
}

const REREAD = "Re-read the pad (GET it; the version is in the ETag header), then retry with If-Match: {version}.";

function writeResponse(c: Context<RoomEnv>, result: WriteResult): Response {
  if (result.ok) return c.json({ success: true, version: result.version }, 200, { ETag: etag(result.version) });
  switch (result.error) {
    case "precondition_required":
      return c.json({ error: `This pad already exists, so replacing it requires If-Match. ${REREAD}` }, 428);
    case "exists":
      return c.json({ error: `This pad already exists, so If-None-Match: * refused to create it. ${REREAD}` }, 412);
    case "conflict":
      if (result.currentVersion === null) {
        return c.json(
          {
            error: "Conflict: this pad no longer exists. Re-read the room's pads; to create it again, send If-None-Match: * instead of If-Match.",
            currentVersion: null,
          },
          409
        );
      }
      return c.json(
        {
          error: `Conflict: the pad is now at version ${result.currentVersion}. Re-read the pad, merge your change into it, then retry with If-Match: ${result.currentVersion}. To add text without merging, POST to /append instead.`,
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

/** Raw text by default, so a fetch tool sees just the content; JSON only when asked for. */
function padResponse(c: Context<RoomEnv>, pad: Pad): Response {
  const headers = { ETag: etag(pad.version), "Cache-Control": "no-store" };
  if (c.req.header("Accept")?.includes("application/json")) return c.json(pad, 200, headers);
  return c.body(pad.content, 200, {
    ...headers,
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
}

export function registerPadRoutes(app: Hono<RoomEnv>, store: PadStore, expiresAt: () => number | null, sql: SqlStorage): void {
  const base = "/r/:roomId/:secret/pads";

  app.get(base, async (c) => {
    const expires = expiresAt();
    const role = c.get("role");
    // Only the write-key holder gets the read URL, so they can share read-only access from the UI.
    let readUrl: string | null = null;
    if (role === "write") {
      const readSecret = await readSecretFor(sql, c.req.param("secret") ?? "");
      if (readSecret) readUrl = `${new URL(c.req.url).origin}/r/${c.req.param("roomId")}/${readSecret}`;
    }
    return c.json({
      pads: store.list(),
      expires_at: expires === null ? null : new Date(expires).toISOString(),
      role,
      read_url: readUrl,
    });
  });

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
    return padResponse(c, pad);
  });

  app.put(`${base}/:name`, requireWrite, async (c) => {
    const name = parsePadName(c);
    if (!name.ok) return rejectUnread(c, name.response);
    const expected = parsePrecondition(c);
    if (!expected.ok) return rejectUnread(c, expected.response);
    const body = await parseWriteBody(c, replaceBodySchema, (b) => b.content);
    if (!body.ok) return body.response;
    return writeResponse(c, store.replace(name.value, body.value, requestSource(c), expected.value));
  });

  app.post(`${base}/:name/append`, requireWrite, async (c) => {
    const name = parsePadName(c);
    if (!name.ok) return rejectUnread(c, name.response);
    const body = await parseWriteBody(c, appendBodySchema, (b) => b.text);
    if (!body.ok) return body.response;
    return writeResponse(c, store.append(name.value, body.value, requestSource(c)));
  });

  app.delete(`${base}/:name`, requireWrite, (c) => {
    const name = parsePadName(c);
    if (!name.ok) return name.response;
    store.delete(name.value);
    return c.json({ success: true });
  });
}

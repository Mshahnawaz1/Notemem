import { DurableObject } from "cloudflare:workers";
import type { Hono } from "hono";
import { createRoomApp } from "./api";
import type { RoomEnv } from "./api/auth";
import { initSchema } from "./lib/db";
import { storeKeyHashes } from "./lib/keys";
import { PadStore } from "./lib/pads";
import { roomKeysSchema } from "./lib/schemas";
import { createMcpHandler } from "./mcp/handler";

const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

export class Room extends DurableObject<CloudflareBindings> {
  private readonly app: Hono<RoomEnv>;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    initSchema(ctx.storage.sql);
    const store = new PadStore(ctx.storage);
    this.app = createRoomApp({ sql: ctx.storage.sql, store, mcp: createMcpHandler(store) });
  }

  /** Called once by the edge router with SHA-256 hashes of the new room's secrets. */
  init(keys: { readHash: string; writeHash: string }): boolean {
    const { readHash, writeHash } = roomKeysSchema.parse(keys);
    return storeKeyHashes(this.ctx.storage.sql, readHash, writeHash);
  }

  async fetch(request: Request): Promise<Response> {
    // Reset the 30-day inactivity alarm
    await this.ctx.storage.setAlarm(Date.now() + INACTIVITY_MS);
    return this.app.fetch(request, this.env);
  }

  async alarm() {
    // 30 days of inactivity reached, delete everything
    await this.ctx.storage.deleteAll();
  }
}

import { DurableObject } from "cloudflare:workers";
import type { Hono } from "hono";
import { createRoomApp } from "./api";
import type { RoomEnv } from "./api/auth";
import { initSchema, roomExists } from "./lib/db";
import { extendExpiry, INACTIVITY_MS, readExpiresAt } from "./lib/expiry";
import { storeKeyHashes } from "./lib/keys";
import { DEFAULT_LIMITS, PadStore } from "./lib/pads";
import type { PadEvent } from "./lib/pads";
import { roomKeysSchema } from "./lib/schemas";
import { createMcpHandler } from "./mcp/handler";

export class Room extends DurableObject<CloudflareBindings> {
  private readonly app: Hono<RoomEnv>;
  /** False for a room ID that `POST /api/rooms` never created; such a room must not store anything. */
  private exists: boolean;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    this.exists = roomExists(ctx.storage.sql);
    if (this.exists) initSchema(ctx.storage.sql);
    // Answered by the runtime without waking the object, so clients can keep idle sockets alive for free.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    const store = new PadStore(ctx.storage, DEFAULT_LIMITS, (event) => {
      this.broadcast(event);
      this.extendExpiry();
    });
    this.app = createRoomApp({
      sql: ctx.storage.sql,
      store,
      mcp: createMcpHandler(store),
      expiresAt: () => readExpiresAt(ctx.storage.sql),
      acceptWebSocket: (socket) => ctx.acceptWebSocket(socket),
    });
  }

  /** Called once by the edge router with SHA-256 hashes of the new room's secrets. */
  async init(keys: { readHash: string; writeHash: string }): Promise<boolean> {
    const { readHash, writeHash } = roomKeysSchema.parse(keys);
    initSchema(this.ctx.storage.sql);
    const expiresAt = Date.now() + INACTIVITY_MS;
    if (!storeKeyHashes(this.ctx.storage.sql, readHash, writeHash, expiresAt)) return false;
    await this.ctx.storage.setAlarm(expiresAt);
    this.exists = true;
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.exists) {
      if (request.body) await request.arrayBuffer();
      return Response.json({ error: "Room not found. It may have expired after 30 days without changes." }, { status: 404 });
    }
    return this.app.fetch(request, this.env);
  }

  async alarm() {
    // A write may have moved the expiry after this alarm was scheduled.
    const expiresAt = this.exists ? readExpiresAt(this.ctx.storage.sql) : null;
    if (expiresAt !== null && expiresAt > Date.now()) {
      await this.ctx.storage.setAlarm(expiresAt);
      return;
    }
    for (const socket of this.ctx.getWebSockets()) socket.close(1001, "Room expired");
    await this.ctx.storage.deleteAll();
    this.exists = false;
  }

  // Clients only listen; anything they send other than "ping" is ignored.
  webSocketMessage(): void {}

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    // 1005 and 1006 are reported by the runtime but can't be sent back.
    socket.close(code === 1005 || code === 1006 ? 1000 : code, reason);
  }

  /** Runs after every committed write; see `extendExpiry`. */
  private extendExpiry(): void {
    const next = extendExpiry(this.ctx.storage.sql, Date.now());
    // The output gate holds the response until the alarm is stored, so there is nothing to await.
    if (next !== null) void this.ctx.storage.setAlarm(next);
  }

  private broadcast(event: PadEvent): void {
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // The socket closed between getWebSockets() and send(); its close handler cleans up.
      }
    }
  }
}

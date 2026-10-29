import { DurableObject } from "cloudflare:workers";
import type { Hono } from "hono";
import { createRoomApp } from "./api";
import type { RoomEnv } from "./api/auth";
import { initSchema } from "./lib/db";
import { storeKeyHashes } from "./lib/keys";
import { DEFAULT_LIMITS, PadStore } from "./lib/pads";
import type { PadEvent } from "./lib/pads";
import { roomKeysSchema } from "./lib/schemas";
import { createMcpHandler } from "./mcp/handler";

const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

export class Room extends DurableObject<CloudflareBindings> {
  private readonly app: Hono<RoomEnv>;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    initSchema(ctx.storage.sql);
    // Answered by the runtime without waking the object, so clients can keep idle sockets alive for free.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    const store = new PadStore(ctx.storage, DEFAULT_LIMITS, (event) => this.broadcast(event));
    this.app = createRoomApp({
      sql: ctx.storage.sql,
      store,
      mcp: createMcpHandler(store),
      expiresAt: () => ctx.storage.getAlarm(),
      acceptWebSocket: (socket) => ctx.acceptWebSocket(socket),
    });
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
    for (const socket of this.ctx.getWebSockets()) socket.close(1001, "Room expired");
    await this.ctx.storage.deleteAll();
  }

  // Clients only listen; anything they send other than "ping" is ignored.
  webSocketMessage(): void {}

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    // 1005 and 1006 are reported by the runtime but can't be sent back.
    socket.close(code === 1005 || code === 1006 ? 1000 : code, reason);
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

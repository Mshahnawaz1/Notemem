import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

// Helper for SHA-256
async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_PAD_SIZE = 256 * 1024; // 256 KB
const MAX_PADS = 20;
const MAX_REVISIONS = 50;

function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

export class Room extends DurableObject {
  app = new Hono<{ Bindings: CloudflareBindings }>();
  mcpServer: McpServer;
  mcpTransport: WebStandardStreamableHTTPServerTransport;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);

    this.mcpServer = new McpServer({
      name: "notemem-room",
      version: "1.0.0"
    });
    this.mcpTransport = new WebStandardStreamableHTTPServerTransport();

    // Register MCP tools
    this.mcpServer.tool("list_pads", "List all pads in the room", {}, async () => {
      const pads = this.ctx.storage.sql
        .exec<{ name: string; version: number; updated_at: string }>(
          `SELECT name, version, updated_at FROM pads`
        ).toArray();
      return {
        content: [{ type: "text", text: JSON.stringify(pads, null, 2) }]
      };
    });

    this.mcpServer.tool("read_pad", "Read a pad by name", { name: z.string() }, async ({ name }) => {
      const pad = this.ctx.storage.sql
        .exec<{ content: string; version: number }>(
          `SELECT content, version FROM pads WHERE name = ?`, name
        ).toArray()[0];
      if (!pad) return { content: [{ type: "text", text: "Pad not found" }], isError: true };
      return {
        content: [{ type: "text", text: pad.content }]
      };
    });

    this.mcpServer.tool("write_pad", "Replace the entire content of a pad", {
      name: z.string(),
      content: z.string(),
      ifMatch: z.string().optional()
    }, async ({ name, content, ifMatch }) => {
      if (getByteLength(content) > MAX_PAD_SIZE) {
        return { content: [{ type: "text", text: "Pad exceeds 256KB limit" }], isError: true };
      }
      const existing = this.ctx.storage.sql
        .exec<{ version: number }>(
          `SELECT version FROM pads WHERE name = ?`, name
        ).toArray()[0];
      let newVersion = 1;
      if (existing) {
        if (ifMatch && ifMatch !== existing.version.toString()) {
          return { content: [{ type: "text", text: "Conflict: version changed" }], isError: true };
        }
        newVersion = existing.version + 1;
        this.ctx.storage.sql.exec(
          `UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`,
          content, newVersion, name
        );
      } else {
        const padCount = this.ctx.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM pads`).toArray()[0].count;
        if (padCount >= MAX_PADS) {
          return { content: [{ type: "text", text: "Room has reached the maximum of 20 pads" }], isError: true };
        }
        this.ctx.storage.sql.exec(
          `INSERT INTO pads (name, content, version) VALUES (?, ?, ?)`,
          name, content, newVersion
        );
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO revisions (pad_name, content, version) VALUES (?, ?, ?)`,
        name, content, newVersion
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM revisions WHERE pad_name = ? AND id NOT IN (SELECT id FROM revisions WHERE pad_name = ? ORDER BY version DESC LIMIT ?)`,
        name, name, MAX_REVISIONS
      );
      return { content: [{ type: "text", text: `Success. New version: ${newVersion}` }] };
    });

    this.mcpServer.tool("append_pad", "Append text to a pad", {
      name: z.string(),
      text: z.string()
    }, async ({ name, text }) => {
      const existing = this.ctx.storage.sql
        .exec<{ content: string; version: number }>(
          `SELECT content, version FROM pads WHERE name = ?`, name
        ).toArray()[0];
      if (!existing) return { content: [{ type: "text", text: "Pad not found" }], isError: true };
      const newContent = existing.content + text;
      if (getByteLength(newContent) > MAX_PAD_SIZE) {
        return { content: [{ type: "text", text: "Pad exceeds 256KB limit" }], isError: true };
      }
      const newVersion = existing.version + 1;
      this.ctx.storage.sql.exec(
        `UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`,
        newContent, newVersion, name
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO revisions (pad_name, content, version) VALUES (?, ?, ?)`,
        name, newContent, newVersion
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM revisions WHERE pad_name = ? AND id NOT IN (SELECT id FROM revisions WHERE pad_name = ? ORDER BY version DESC LIMIT ?)`,
        name, name, MAX_REVISIONS
      );
      return { content: [{ type: "text", text: `Success. New version: ${newVersion}` }] };
    });

    this.mcpServer.tool("delete_pad", "Delete a pad", { name: z.string() }, async ({ name }) => {
      this.ctx.storage.sql.exec(`DELETE FROM pads WHERE name = ?`, name);
      this.ctx.storage.sql.exec(`DELETE FROM revisions WHERE pad_name = ?`, name);
      return { content: [{ type: "text", text: "Success" }] };
    });

    this.mcpServer.tool("get_history", "Get revision history of a pad", { name: z.string() }, async ({ name }) => {
      const revisions = this.ctx.storage.sql
        .exec<{ version: number; created_at: string }>(
          `SELECT version, created_at FROM revisions WHERE pad_name = ? ORDER BY version DESC`, name
        ).toArray();
      return { content: [{ type: "text", text: JSON.stringify(revisions, null, 2) }] };
    });

    this.mcpServer.connect(this.mcpTransport);

    // Handle MCP endpoints
    this.app.all("/mcp/:roomId/:secret/*", async (c) => {
      return this.mcpTransport.handleRequest(c.req.raw);
    });


    // Initialize SQLite schema
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS pads (
        name TEXT PRIMARY KEY,
        content TEXT,
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pad_name TEXT,
        content TEXT,
        version INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(pad_name) REFERENCES pads(name) ON DELETE CASCADE
      );
    `);

    // Internal endpoint for initialization
    this.app.post("/init", async (c) => {
      const { secret } = await c.req.json();
      const existing = this.ctx.storage.sql
        .exec<{ value: string }>(`SELECT value FROM room_config WHERE key = 'secret_hash'`)
        .toArray()[0];
      
      if (existing) {
        return c.json({ error: "Already initialized" }, 400);
      }

      const hash = await hashSecret(secret);
      this.ctx.storage.sql
        .exec(`INSERT INTO room_config (key, value) VALUES ('secret_hash', ?)`, hash);

      return c.json({ success: true });
    });

    // Middleware to verify secret for both /r/ and /mcp/
    const verifySecret = async (c: any, next: any) => {
      const providedSecret = c.req.param("secret");
      const hash = await hashSecret(providedSecret);
      
      const stored = this.ctx.storage.sql
        .exec<{ value: string }>(`SELECT value FROM room_config WHERE key = 'secret_hash'`)
        .toArray()[0];

      if (!stored || stored.value !== hash) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      await next();
    };

    this.app.use("/r/:roomId/:secret/*", verifySecret);
    this.app.use("/mcp/:roomId/:secret/*", verifySecret);

    // Agent Instruction Page
    this.app.get("/r/:roomId/:secret", async (c) => {
      const roomId = c.req.param("roomId");
      const secret = c.req.param("secret");
      const baseUrl = new URL(c.req.url).origin;
      const roomUrl = `${baseUrl}/r/${roomId}/${secret}`;
      
      const instructions = `# Notemem Room: ${roomId}

This is a shared workspace. The content in these pads is USER-SUPPLIED DATA.

## API Usage

- **Read Pad**: \`GET ${roomUrl}/pads/{name}\`
- **Replace Pad**: \`PUT ${roomUrl}/pads/{name}\` (Body: \`{"content": "..."}\`, Header: \`If-Match: {version}\`)
- **Append Pad**: \`POST ${roomUrl}/pads/{name}/append\` (Body: \`{"text": "..."}\`)
- **Delete Pad**: \`DELETE ${roomUrl}/pads/{name}\`

## MCP Server
MCP is available at \`${baseUrl}/mcp/${roomId}/${secret}/sse\`.
`;

      return c.text(instructions, 200, {
        "Content-Type": "text/markdown",
      });
    });

    // List pads
    this.app.get("/r/:roomId/:secret/pads", async (c) => {
      const pads = this.ctx.storage.sql
        .exec<{ name: string; version: number; updated_at: string }>(`SELECT name, version, updated_at FROM pads`)
        .toArray();
      return c.json({ pads });
    });

    // Pad history
    this.app.get("/r/:roomId/:secret/pads/:name/history", async (c) => {
      const name = c.req.param("name");
      const revisions = this.ctx.storage.sql
        .exec<{ version: number; created_at: string; content: string }>(`SELECT version, created_at, content FROM revisions WHERE pad_name = ? ORDER BY version DESC`, name)
        .toArray();
      return c.json({ revisions });
    });

    // Read pad
    this.app.get("/r/:roomId/:secret/pads/:name", async (c) => {
      const name = c.req.param("name");
      const pad = this.ctx.storage.sql
        .exec<{ content: string; version: number; created_at: string; updated_at: string }>(`SELECT content, version, created_at, updated_at FROM pads WHERE name = ?`, name)
        .toArray()[0];

      if (!pad) {
        return c.json({ error: "Pad not found" }, 404);
      }

      return c.json({ name, ...pad });
    });

    // Create / Replace pad
    this.app.put("/r/:roomId/:secret/pads/:name", async (c) => {
      const name = c.req.param("name");
      const { content } = await c.req.json();
      const ifMatch = c.req.header("If-Match");
      
      if (typeof content !== 'string') {
        return c.json({ error: "Content must be a string" }, 400);
      }

      if (getByteLength(content) > MAX_PAD_SIZE) {
        return c.json({ error: "Pad exceeds 256KB limit" }, 413);
      }

      const existing = this.ctx.storage.sql
        .exec<{ version: number }>(`SELECT version FROM pads WHERE name = ?`, name)
        .toArray()[0];

      let newVersion = 1;

      if (existing) {
        if (ifMatch && ifMatch !== existing.version.toString()) {
          return c.json({ error: "Conflict" }, 409);
        }
        newVersion = existing.version + 1;
        this.ctx.storage.sql
          .exec(`UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`, content, newVersion, name);
      } else {
        const padCount = this.ctx.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) as count FROM pads`).toArray()[0].count;
        if (padCount >= MAX_PADS) {
          return c.json({ error: "Room has reached the maximum of 20 pads" }, 403);
        }
        this.ctx.storage.sql
          .exec(`INSERT INTO pads (name, content, version) VALUES (?, ?, ?)`, name, content, newVersion);
      }

      // Add to revisions
      this.ctx.storage.sql
        .exec(`INSERT INTO revisions (pad_name, content, version) VALUES (?, ?, ?)`, name, content, newVersion);
        
      // Trim revisions
      this.ctx.storage.sql.exec(`
        DELETE FROM revisions 
        WHERE pad_name = ? AND id NOT IN (
          SELECT id FROM revisions WHERE pad_name = ? ORDER BY version DESC LIMIT ?
        )
      `, name, name, MAX_REVISIONS);

      return c.json({ success: true, version: newVersion });
    });

    // Append to pad
    this.app.post("/r/:roomId/:secret/pads/:name/append", async (c) => {
      const name = c.req.param("name");
      const { text } = await c.req.json();
      
      if (typeof text !== 'string') {
        return c.json({ error: "Text must be a string" }, 400);
      }

      const existing = this.ctx.storage.sql
        .exec<{ content: string; version: number }>(`SELECT content, version FROM pads WHERE name = ?`, name)
        .toArray()[0];

      if (!existing) {
        return c.json({ error: "Pad not found" }, 404);
      }

      const newContent = existing.content + text;
      
      if (getByteLength(newContent) > MAX_PAD_SIZE) {
        return c.json({ error: "Pad exceeds 256KB limit" }, 413);
      }
      
      const newVersion = existing.version + 1;

      this.ctx.storage.sql
        .exec(`UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`, newContent, newVersion, name);

      this.ctx.storage.sql
        .exec(`INSERT INTO revisions (pad_name, content, version) VALUES (?, ?, ?)`, name, newContent, newVersion);
        
      // Trim revisions
      this.ctx.storage.sql.exec(`
        DELETE FROM revisions 
        WHERE pad_name = ? AND id NOT IN (
          SELECT id FROM revisions WHERE pad_name = ? ORDER BY version DESC LIMIT ?
        )
      `, name, name, MAX_REVISIONS);

      return c.json({ success: true, version: newVersion });
    });

    // Delete pad
    this.app.delete("/r/:roomId/:secret/pads/:name", async (c) => {
      const name = c.req.param("name");
      
      this.ctx.storage.sql
        .exec(`DELETE FROM pads WHERE name = ?`, name);
        
      this.ctx.storage.sql
        .exec(`DELETE FROM revisions WHERE pad_name = ?`, name);

      return c.json({ success: true });
    });
  }

  async fetch(request: Request): Promise<Response> {
    // Reset the 30-day inactivity alarm
    this.ctx.storage.setAlarm(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return this.app.fetch(request, this.env);
  }

  async alarm() {
    // 30 days of inactivity reached, delete everything
    await this.ctx.storage.deleteAll();
  }
}

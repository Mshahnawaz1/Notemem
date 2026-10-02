import * as fs from 'fs';

let content = fs.readFileSync('src/room.ts', 'utf-8');

// add imports
content = content.replace(
  'import { Hono } from "hono";',
  'import { Hono } from "hono";\nimport { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\nimport { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";\nimport { z } from "zod";'
);

// add properties
content = content.replace(
  'app = new Hono<{ Bindings: CloudflareBindings }>();',
  `app = new Hono<{ Bindings: CloudflareBindings }>();
  mcpServer: McpServer;
  mcpTransport: WebStandardStreamableHTTPServerTransport;`
);

// add setup inside constructor
const setupCode = `
    this.mcpServer = new McpServer({
      name: "notemem-room",
      version: "1.0.0"
    });
    this.mcpTransport = new WebStandardStreamableHTTPServerTransport();
    this.mcpServer.connect(this.mcpTransport);

    // Register MCP tools
    this.mcpServer.tool("list_pads", "List all pads in the room", {}, async () => {
      const pads = this.ctx.storage.sql
        .exec<{ name: string; version: number; updated_at: string }>(
          \`SELECT name, version, updated_at FROM pads\`
        ).toArray();
      return {
        content: [{ type: "text", text: JSON.stringify(pads, null, 2) }]
      };
    });

    this.mcpServer.tool("read_pad", "Read a pad by name", { name: z.string() }, async ({ name }) => {
      const pad = this.ctx.storage.sql
        .exec<{ content: string; version: number }>(
          \`SELECT content, version FROM pads WHERE name = ?\`, name
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
          \`SELECT version FROM pads WHERE name = ?\`, name
        ).toArray()[0];
      let newVersion = 1;
      if (existing) {
        if (ifMatch && ifMatch !== existing.version.toString()) {
          return { content: [{ type: "text", text: "Conflict: version changed" }], isError: true };
        }
        newVersion = existing.version + 1;
        this.ctx.storage.sql.exec(
          \`UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?\`,
          content, newVersion, name
        );
      } else {
        const padCount = this.ctx.storage.sql.exec<{ count: number }>(\`SELECT COUNT(*) as count FROM pads\`).toArray()[0].count;
        if (padCount >= MAX_PADS) {
          return { content: [{ type: "text", text: "Room has reached the maximum of 20 pads" }], isError: true };
        }
        this.ctx.storage.sql.exec(
          \`INSERT INTO pads (name, content, version) VALUES (?, ?, ?)\`,
          name, content, newVersion
        );
      }
      this.ctx.storage.sql.exec(
        \`INSERT INTO revisions (pad_name, content, version) VALUES (?, ?, ?)\`,
        name, content, newVersion
      );
      this.ctx.storage.sql.exec(
        \`DELETE FROM revisions WHERE pad_name = ? AND id NOT IN (SELECT id FROM revisions WHERE pad_name = ? ORDER BY version DESC LIMIT ?)\`,
        name, name, MAX_REVISIONS
      );
      return { content: [{ type: "text", text: \`Success. New version: \${newVersion}\` }] };
    });

    this.mcpServer.tool("append_pad", "Append text to a pad", {
      name: z.string(),
      text: z.string()
    }, async ({ name, text }) => {
      const existing = this.ctx.storage.sql
        .exec<{ content: string; version: number }>(
          \`SELECT content, version FROM pads WHERE name = ?\`, name
        ).toArray()[0];
      if (!existing) return { content: [{ type: "text", text: "Pad not found" }], isError: true };
      const newContent = existing.content + text;
      if (getByteLength(newContent) > MAX_PAD_SIZE) {
        return { content: [{ type: "text", text: "Pad exceeds 256KB limit" }], isError: true };
      }
      const newVersion = existing.version + 1;
      this.ctx.storage.sql.exec(
        \`UPDATE pads SET content = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?\`,
        newContent, newVersion, name
      );
      this.ctx.storage.sql.exec(
        \`INSERT INTO revisions (pad_name, content, version) VALUES (?, ?, ?)\`,
        name, newContent, newVersion
      );
      this.ctx.storage.sql.exec(
        \`DELETE FROM revisions WHERE pad_name = ? AND id NOT IN (SELECT id FROM revisions WHERE pad_name = ? ORDER BY version DESC LIMIT ?)\`,
        name, name, MAX_REVISIONS
      );
      return { content: [{ type: "text", text: \`Success. New version: \${newVersion}\` }] };
    });

    this.mcpServer.tool("delete_pad", "Delete a pad", { name: z.string() }, async ({ name }) => {
      this.ctx.storage.sql.exec(\`DELETE FROM pads WHERE name = ?\`, name);
      this.ctx.storage.sql.exec(\`DELETE FROM revisions WHERE pad_name = ?\`, name);
      return { content: [{ type: "text", text: "Success" }] };
    });

    this.mcpServer.tool("get_history", "Get revision history of a pad", { name: z.string() }, async ({ name }) => {
      const revisions = this.ctx.storage.sql
        .exec<{ version: number; created_at: string }>(
          \`SELECT version, created_at FROM revisions WHERE pad_name = ? ORDER BY version DESC\`, name
        ).toArray();
      return { content: [{ type: "text", text: JSON.stringify(revisions, null, 2) }] };
    });

    // Handle MCP endpoints
    this.app.all("/mcp/:roomId/:secret/*", async (c) => {
      return this.mcpTransport.handleRequest(c.req.raw);
    });
`;

content = content.replace(
  'super(ctx, env);',
  'super(ctx, env);\n' + setupCode
);

fs.writeFileSync('src/room.ts', content);

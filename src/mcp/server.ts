import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PadStore, WriteResult } from "../lib/pads";
import { describeIssue, ifMatchSchema, padNameSchema } from "../lib/schemas";
import { z } from "zod";

function text(value: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text: value }], ...(isError ? { isError } : {}) };
}

function writeResultText(result: WriteResult): CallToolResult {
  if (result.ok) return text(`Success. New version: ${result.version}`);
  switch (result.error) {
    case "not_found":
      return text("Pad not found. Create it with write_pad first.", true);
    case "conflict":
      return text(
        `Conflict: the pad is now at version ${result.currentVersion}. Re-read it with read_pad, then retry with ifMatch "${result.currentVersion}".`,
        true
      );
    case "too_large":
      return text(`Pad exceeds the ${result.limit / 1024} KB limit.`, true);
    case "pad_limit":
      return text(`Room has reached the maximum of ${result.limit} pads. Delete a pad first.`, true);
  }
}

export function createMcpServer(store: PadStore): McpServer {
  const server = new McpServer({ name: "notemem-room", version: "1.0.0" });

  server.tool("list_pads", "List all pads in the room", {}, () => text(JSON.stringify(store.list(), null, 2)));

  server.tool("read_pad", "Read a pad by name", { name: padNameSchema }, ({ name }) => {
    const pad = store.read(name);
    if (!pad) return text("Pad not found", true);
    return text(pad.content);
  });

  server.tool(
    "write_pad",
    "Replace the entire content of a pad",
    {
      name: padNameSchema,
      content: z.string(),
      ifMatch: z.string().optional().describe("The version you last read; the write fails if the pad changed since."),
    },
    ({ name, content, ifMatch }) => {
      if (ifMatch === undefined) return writeResultText(store.replace(name, content, "mcp"));
      const expected = ifMatchSchema.safeParse(ifMatch);
      if (!expected.success) return text(describeIssue(expected.error), true);
      return writeResultText(store.replace(name, content, "mcp", expected.data));
    }
  );

  server.tool("append_pad", "Append text to a pad", { name: padNameSchema, text: z.string() }, ({ name, text: appended }) =>
    writeResultText(store.append(name, appended, "mcp"))
  );

  server.tool("delete_pad", "Delete a pad", { name: padNameSchema }, ({ name }) => {
    store.delete(name);
    return text("Success");
  });

  server.tool("get_history", "Get revision history of a pad", { name: padNameSchema }, ({ name }) => {
    const revisions = store.history(name).map(({ version, created_at, source }) => ({ version, created_at, source }));
    return text(JSON.stringify(revisions, null, 2));
  });

  return server;
}

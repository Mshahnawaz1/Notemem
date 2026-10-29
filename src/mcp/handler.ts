import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { discardBody } from "../api/auth";
import type { Role } from "../lib/keys";
import type { PadStore } from "../lib/pads";
import { createMcpServer } from "./server";

export type McpHandler = (request: Request, role: Role) => Promise<Response>;

/**
 * One stateful server and transport per room (replaced by a per-request transport in Phase 3).
 * Until tools are registered per role, read keys are refused rather than given write tools.
 */
export function createMcpHandler(store: PadStore): McpHandler {
  const server = createMcpServer(store);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  // The transport needs no async setup; connect() only wires up handlers.
  void server.connect(transport);

  return async (request, role) => {
    if (role !== "write") {
      await discardBody(request);
      return Response.json({ error: "MCP needs the room's write URL for now; read-only MCP is not available yet." }, { status: 403 });
    }
    let parsedBody: unknown;
    if (request.method === "POST") {
      try {
        parsedBody = await request.clone().json();
      } catch {
        // Empty or invalid JSON; the transport reports it.
      }
    }
    return transport.handleRequest(request, { parsedBody });
  };
}

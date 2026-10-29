import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { discardBody } from "../api/auth";
import type { Role } from "../lib/keys";
import type { PadStore } from "../lib/pads";
import { createMcpServer } from "./server";

export type McpHandler = (request: Request, role: Role) => Promise<Response>;

/**
 * Stateless Streamable HTTP: every POST gets its own server and transport, so any number of
 * clients can share a room and nothing is lost when the Durable Object is evicted.
 */
export function createMcpHandler(store: PadStore): McpHandler {
  return async (request, role) => {
    // Without sessions there is no server-to-client stream to open (GET) or session to end (DELETE).
    // An open GET stream would also keep the Durable Object awake.
    if (request.method !== "POST") {
      await discardBody(request);
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This MCP server is stateless; send JSON-RPC over POST." }, id: null },
        { status: 405, headers: { Allow: "POST" } }
      );
    }

    let parsedBody: unknown;
    try {
      parsedBody = await request.clone().json();
    } catch {
      // Empty or invalid JSON; the transport reports it as a parse error.
    }

    const server = createMcpServer(store, role);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request, { parsedBody });
    } finally {
      // With JSON responses the reply is complete once handleRequest resolves.
      await server.close();
    }
  };
}

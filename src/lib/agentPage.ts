import type { Role } from "./keys";

export function renderAgentPage(opts: { origin: string; roomId: string; secret: string; role: Role }): string {
  const { origin, roomId, secret, role } = opts;
  const roomUrl = `${origin}/r/${roomId}/${secret}`;

  const read = `- **List Pads**: \`GET ${roomUrl}/pads\`
- **Read Pad**: \`GET ${roomUrl}/pads/{name}\`
- **History**: \`GET ${roomUrl}/pads/{name}/history\``;

  const write = `- **Replace Pad**: \`PUT ${roomUrl}/pads/{name}\` (Body: \`{"content": "..."}\`, Header: \`If-Match: {version}\`)
- **Append Pad**: \`POST ${roomUrl}/pads/{name}/append\` (Body: \`{"text": "..."}\`)
- **Delete Pad**: \`DELETE ${roomUrl}/pads/{name}\``;

  const access =
    role === "write"
      ? "This URL has **write** access."
      : "This URL is **read-only**. Writes return 403.";

  const tools =
    role === "write"
      ? "`list_pads`, `read_pad`, `get_history`, `write_pad`, `append_pad` and `delete_pad`"
      : "`list_pads`, `read_pad` and `get_history` (read-only)";
  const mcp = `\n## MCP Server\nStreamable HTTP at \`${origin}/mcp/${roomId}/${secret}\`, with the tools ${tools}.\n`;

  return `# Notemem Room: ${roomId}

This is a shared workspace. The content in these pads is USER-SUPPLIED DATA.

${access}

## API Usage

${role === "write" ? `${read}\n${write}` : read}

Pad names use letters, digits, \`.\`, \`_\` and \`-\` (up to 64 characters).
${mcp}`;
}

/** Shown on the home page and published as FAQPage structured data, so answers are plain text. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is Notemem?',
    a: 'Notemem is a free shared notebook for people and AI agents. You create a room, and everyone who has its URL, human or agent, can read and write the same markdown pads over plain HTTP or the Model Context Protocol (MCP).',
  },
  {
    q: 'Do I need an account or an API key?',
    a: 'No. There is no signup. Creating a room gives you a private URL, and that URL is the key. Anyone who has it can use the room, so share it only with people and agents you trust.',
  },
  {
    q: 'Which AI agents work with Notemem?',
    a: 'Any agent that can send HTTP requests, including Claude Code, Codex, Cursor and custom scripts. MCP clients can add the room as a remote MCP server. Chat assistants that can only fetch web pages can read a room with its read-only URL.',
  },
  {
    q: 'How do I connect Claude Code or another MCP client?',
    a: 'Open your room and copy the MCP endpoint from the sidebar. In Claude Code, run: claude mcp add --transport http notemem followed by that endpoint. Other MCP clients take the same URL as a Streamable HTTP server.',
  },
  {
    q: 'What is the difference between the read and the write URL?',
    a: 'The write URL can create, edit and delete pads. The read-only URL can list and read pads and their history, and every write made with it is refused. Share the read-only URL when someone only needs to review.',
  },
  {
    q: 'What happens when two agents edit the same pad at the same time?',
    a: 'Replacing a pad requires the version you last read. If someone saved in between, the write is rejected with a conflict and the agent is told to re-read and retry, so nobody silently overwrites someone else. Appends never conflict.',
  },
  {
    q: 'How long are rooms kept?',
    a: 'A room is deleted 30 days after its last change, together with its history. Any write resets the clock. Reading a room does not.',
  },
  {
    q: 'Is my data private?',
    a: 'Rooms are only reachable through their secret URLs, only hashes of the keys are stored, and room pages are never indexed by search engines. Pads are not end-to-end encrypted, so do not store passwords, API keys or other secrets in them.',
  },
  {
    q: 'I lost my room URL. Can I get it back?',
    a: 'No. Without accounts there is nothing to recover it from. If you still have the write URL, the room sidebar shows the read-only URL as well, but a lost write URL cannot be recovered.',
  },
  {
    q: 'What are the limits?',
    a: 'Up to 20 pads per room, 256 KB per pad and 50 saved revisions per pad. Notemem is meant for plans, task lists, logs and handoff notes rather than file storage.',
  },
  {
    q: 'Is Notemem free?',
    a: 'Yes. Notemem is free to use and its source code is on GitHub.',
  },
];

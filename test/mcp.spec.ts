import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { call, createRoom, putJson, readPad } from './helpers'

const READ_TOOLS = ['get_history', 'list_pads', 'read_pad']
const WRITE_TOOLS = ['append_pad', 'delete_pad', 'get_history', 'list_pads', 'read_pad', 'write_pad']

async function connect(roomId: string, secret: string): Promise<Client> {
  const client = new Client({ name: 'notemem-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`http://example.com/mcp/${roomId}/${secret}`), {
    fetch: (input, init) => call(input instanceof Request ? input.url : input.toString(), init),
  })
  await client.connect(transport)
  return client
}

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult
  const first = result.content[0]
  return { text: first?.type === 'text' ? first.text : '', isError: result.isError === true }
}

async function toolNames(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((tool) => tool.name).sort()
}

describe('MCP', () => {
  it('gives the write key all six tools', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    expect(await toolNames(client)).toEqual(WRITE_TOOLS)
    await client.close()
  })

  it('gives the read key only the read tools', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.readSecret)
    expect(await toolNames(client)).toEqual(READ_TOOLS)
    await expect(client.callTool({ name: 'write_pad', arguments: { name: 'x', content: 'y' } })).resolves.toMatchObject({ isError: true })
    expect((await call(`${room.base}/pads/x`)).status).toBe(404)
    await client.close()
  })

  it('lets a read key read pads written over HTTP', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/notes`, { content: 'hello' })
    const client = await connect(room.roomId, room.readSecret)
    const read = await callTool(client, 'read_pad', { name: 'notes' })
    expect(read.isError).toBe(false)
    expect(read.text).toMatch(/^version: 1\n/)
    expect(read.text.endsWith('---\nhello')).toBe(true)
    await client.close()
  })

  it('writes, appends and records mcp as the source', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    expect((await callTool(client, 'write_pad', { name: 'log', content: 'a' })).text).toContain('New version: 1')
    expect((await callTool(client, 'append_pad', { name: 'log', text: 'b' })).text).toContain('New version: 2')
    const pad = await readPad(`${room.base}/pads/log`)
    expect(pad).toMatchObject({ content: 'ab', version: 2 })
    const history = await (await call(`${room.base}/pads/log/history`)).json<{ revisions: { source: string }[] }>()
    expect(history.revisions.map((r) => r.source)).toEqual(['mcp', 'mcp'])
    await client.close()
  })

  it('accepts ifMatch as a number or a string', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    await callTool(client, 'write_pad', { name: 'p', content: 'v1' })
    expect((await callTool(client, 'write_pad', { name: 'p', content: 'v2', ifMatch: 1 })).isError).toBe(false)
    expect((await callTool(client, 'write_pad', { name: 'p', content: 'v3', ifMatch: '"2"' })).isError).toBe(false)
    await client.close()
  })

  it('tells the agent how to recover from a conflict', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    await callTool(client, 'write_pad', { name: 'p', content: 'v1' })
    await callTool(client, 'write_pad', { name: 'p', content: 'v2', ifMatch: 1 })
    const stale = await callTool(client, 'write_pad', { name: 'p', content: 'v3', ifMatch: 1 })
    expect(stale.isError).toBe(true)
    expect(stale.text).toContain('now at version 2')
    expect(stale.text).toContain('read_pad')
    expect(stale.text).toContain('ifMatch 2')
    await client.close()
  })

  it('points to list_pads when a pad is missing', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    for (const tool of ['read_pad', 'get_history', 'delete_pad']) {
      const result = await callTool(client, tool, { name: 'missing' })
      expect(result.isError).toBe(true)
      expect(result.text).toContain('list_pads')
    }
    await client.close()
  })

  it('creates a missing pad on append_pad', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    const result = await callTool(client, 'append_pad', { name: 'new', text: 'x' })
    expect(result).toMatchObject({ isError: false })
    expect(result.text).toContain('New version: 1')
    expect((await callTool(client, 'read_pad', { name: 'new' })).text).toMatch(/^version: 1\nupdated_at: .+\n---\nx$/)
    await client.close()
  })

  it('refuses to replace an existing pad without ifMatch', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    await callTool(client, 'write_pad', { name: 'p', content: 'original' })
    const blind = await callTool(client, 'write_pad', { name: 'p', content: 'overwrite' })
    expect(blind.isError).toBe(true)
    expect(blind.text).toContain('Call read_pad')
    expect(blind.text).toContain('ifMatch')
    expect((await readPad(`${room.base}/pads/p`)).content).toBe('original')
    await client.close()
  })

  it('reports a conflict when ifMatch names a pad that no longer exists', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    const result = await callTool(client, 'write_pad', { name: 'gone', content: 'x', ifMatch: 1 })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('no longer exists')
    await client.close()
  })

  it('rejects invalid pad names as a tool error', async () => {
    const room = await createRoom()
    const client = await connect(room.roomId, room.writeSecret)
    const result = await callTool(client, 'write_pad', { name: '../etc', content: 'x' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('Pad names use letters')
    await client.close()
  })

  it('serves two concurrent clients on the same room', async () => {
    const room = await createRoom()
    const [a, b] = await Promise.all([connect(room.roomId, room.writeSecret), connect(room.roomId, room.writeSecret)])
    await callTool(a, 'write_pad', { name: 'shared', content: '' })
    const writes = Array.from({ length: 10 }, (_, i) => callTool(i % 2 ? b : a, 'append_pad', { name: 'shared', text: String(i) }))
    const results = await Promise.all(writes)
    expect(results.every((r) => !r.isError)).toBe(true)
    const read = await callTool(b, 'read_pad', { name: 'shared' })
    expect(read.text).toMatch(/^version: 11\n/)
    expect(read.text.split('---\n')[1].split('').sort().join('')).toBe('0123456789')
    await Promise.all([a.close(), b.close()])
  })

  it('serves only the exact MCP URL', async () => {
    const room = await createRoom()
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body }
    expect((await call(`/mcp/${room.roomId}/${room.writeSecret}/sse`, init)).status).toBe(404)
    expect((await call(`/mcp/${room.roomId}/wrongsecret`, init)).status).toBe(401)
    expect((await call(`/mcp/${room.roomId}/${room.writeSecret}`, { method: 'GET' })).status).toBe(405)
    expect((await call(`/mcp/${room.roomId}/${room.writeSecret}`, init)).status).toBe(200)
  })
})

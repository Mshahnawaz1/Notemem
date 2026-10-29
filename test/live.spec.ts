import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { call, createRoom, postJson, putJson } from './helpers'

interface PadEvent { pad: string; version: number; deleted?: true }

/** Opens the room's WebSocket and collects every message it receives. */
async function openSocket(base: string): Promise<{ socket: WebSocket; messages: string[]; next: () => Promise<string> }> {
  const response = await call(`${base}/ws`, { headers: { Upgrade: 'websocket' } })
  expect(response.status).toBe(101)
  const socket = response.webSocket
  if (!socket) throw new Error('no WebSocket on the response')
  socket.accept()
  const messages: string[] = []
  const waiting: ((message: string) => void)[] = []
  socket.addEventListener('message', (event) => {
    const message = String(event.data)
    const resolve = waiting.shift()
    if (resolve) resolve(message)
    else messages.push(message)
  })
  const next = () => {
    const queued = messages.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return new Promise<string>((resolve, reject) => {
      waiting.push(resolve)
      setTimeout(() => reject(new Error('timed out waiting for a WebSocket message')), 2000)
    })
  }
  return { socket, messages, next }
}

async function nextEvent(next: () => Promise<string>): Promise<PadEvent> {
  return JSON.parse(await next()) as PadEvent
}

describe('live updates', () => {
  it('pushes an event after an HTTP write', async () => {
    const room = await createRoom()
    const { socket, next } = await openSocket(room.base)
    await putJson(`${room.base}/pads/plan`, { content: 'v1' })
    expect(await nextEvent(next)).toEqual({ pad: 'plan', version: 1 })
    await postJson(`${room.base}/pads/plan/append`, { text: '+' }, { 'X-Notemem-Source': 'web' })
    expect(await nextEvent(next)).toEqual({ pad: 'plan', version: 2 })
    socket.close()
  })

  it('pushes a deleted event, and nothing for a pad that did not exist', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'v1' })
    const { socket, next } = await openSocket(room.base)
    await call(`${room.base}/pads/missing`, { method: 'DELETE' })
    await call(`${room.base}/pads/plan`, { method: 'DELETE' })
    expect(await nextEvent(next)).toEqual({ pad: 'plan', version: 1, deleted: true })
    socket.close()
  })

  it('pushes nothing for a rejected write', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'v1' })
    const { socket, next } = await openSocket(room.base)
    expect((await putJson(`${room.base}/pads/plan`, { content: 'stale' }, { 'If-Match': '5' })).status).toBe(409)
    expect((await putJson(`${room.base}/pads/plan`, { content: 'blind' })).status).toBe(428)
    await postJson(`${room.base}/pads/plan/append`, { text: '!' })
    // The first event is the append; the rejected writes sent nothing.
    expect(await nextEvent(next)).toEqual({ pad: 'plan', version: 2 })
    socket.close()
  })

  it('pushes MCP writes to every connected socket, including read-key ones', async () => {
    const room = await createRoom()
    const writer = await openSocket(room.base)
    const reader = await openSocket(room.readBase)

    const client = new Client({ name: 'notemem-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://example.com/mcp/${room.roomId}/${room.writeSecret}`), {
      fetch: (input, init) => call(input instanceof Request ? input.url : input.toString(), init),
    }))
    await client.callTool({ name: 'append_pad', arguments: { name: 'log', text: 'hi' } })

    expect(await nextEvent(writer.next)).toEqual({ pad: 'log', version: 1 })
    expect(await nextEvent(reader.next)).toEqual({ pad: 'log', version: 1 })
    await client.close()
    writer.socket.close()
    reader.socket.close()
  })

  it('answers ping with pong', async () => {
    const room = await createRoom()
    const { socket, next } = await openSocket(room.readBase)
    socket.send('ping')
    expect(await next()).toBe('pong')
    socket.close()
  })

  it('requires a WebSocket upgrade and a valid secret', async () => {
    const room = await createRoom()
    expect((await call(`${room.base}/ws`)).status).toBe(426)
    const wrong = await call(`/r/${room.roomId}/${'0'.repeat(32)}/ws`, { headers: { Upgrade: 'websocket' } })
    expect(wrong.status).toBe(401)
    expect(wrong.webSocket).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { call, createRoom, postJson, putJson } from './helpers'

interface WriteResult { success: boolean; version: number }
interface PadJson { name: string; content: string; version: number }

describe('Notemem worker', () => {
  it('creates a room', async () => {
    const response = await call('/api/rooms', { method: 'POST' })
    expect(response.status).toBe(200)
    const data = await response.json<{ roomId: string; readUrl: string; writeUrl: string }>()
    expect(data.roomId).toMatch(/^[0-9a-f]{12}$/)
    expect(data.writeUrl).toMatch(new RegExp(`/r/${data.roomId}/[0-9a-f]{32}$`))
    expect(data.readUrl).toMatch(new RegExp(`/r/${data.roomId}/[0-9a-f]{32}$`))
    expect(data.readUrl).not.toBe(data.writeUrl)
  })

  it('can create a pad', async () => {
    const room = await createRoom()
    const response = await putJson(`${room.base}/pads/mypad`, { content: 'Hello World' })
    expect(response.status).toBe(200)
    const data = await response.json<WriteResult>()
    expect(data.success).toBe(true)
    expect(data.version).toBe(1)
  })

  it('can read a pad', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/mypad`, { content: 'Hello World' })
    const response = await call(`${room.base}/pads/mypad`)
    expect(response.status).toBe(200)
    const data = await response.json<PadJson>()
    expect(data.content).toBe('Hello World')
    expect(data.version).toBe(1)
  })

  it('can append to a pad', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/mypad`, { content: 'Hello World' })
    const response = await postJson(`${room.base}/pads/mypad/append`, { text: '!' })
    expect(response.status).toBe(200)
    const data = await response.json<WriteResult>()
    expect(data.success).toBe(true)
    expect(data.version).toBe(2)
  })

  it('reading pad shows appended content', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/mypad`, { content: 'Hello World' })
    await postJson(`${room.base}/pads/mypad/append`, { text: '!' })
    const response = await call(`${room.base}/pads/mypad`)
    expect(response.status).toBe(200)
    const data = await response.json<PadJson>()
    expect(data.content).toBe('Hello World!')
    expect(data.version).toBe(2)
  })

  it('fails with wrong secret', async () => {
    const room = await createRoom()
    const response = await call(`/r/${room.roomId}/wrongsecret/pads/mypad`)
    expect(response.status).toBe(401)
  })

  it('deletes the pad', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/mypad`, { content: 'Hello World' })
    const response = await call(`${room.base}/pads/mypad`, { method: 'DELETE' })
    expect(response.status).toBe(200)
  })

  it('cannot find the pad anymore', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/mypad`, { content: 'Hello World' })
    await call(`${room.base}/pads/mypad`, { method: 'DELETE' })
    const response = await call(`${room.base}/pads/mypad`)
    expect(response.status).toBe(404)
  })

  it('handles concurrent creates and appends', async () => {
    const room = await createRoom()
    // Create pad first so appends don't 404
    await putJson(`${room.base}/pads/concurrent`, { content: 'A' })

    // Now send appends concurrently
    const [res2, res3] = await Promise.all([
      postJson(`${room.base}/pads/concurrent/append`, { text: 'B' }),
      postJson(`${room.base}/pads/concurrent/append`, { text: 'C' }),
    ])
    expect(res2.status).toBe(200)
    expect(res3.status).toBe(200)

    const data = await (await call(`${room.base}/pads/concurrent`)).json<PadJson>()
    expect(data.content.length).toBe(3) // A + B + C
    expect(data.content).toContain('B')
    expect(data.content).toContain('C')
    expect(data.version).toBe(3)
  })
})

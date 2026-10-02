import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import worker from '../src/index'

describe('Notemem worker', () => {
  let roomId: string
  let secret: string

  it('creates a room', async () => {
    const request = new Request('http://example.com/api/rooms', { method: 'POST' })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    const data = await response.json() as { roomId: string, secret: string }
    expect(data.roomId).toBeDefined()
    expect(data.secret).toBeDefined()
    roomId = data.roomId
    secret = data.secret
  })

  it('can create a pad', async () => {
    const request = new Request(`http://example.com/r/${roomId}/${secret}/pads/mypad`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello World' })
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.success).toBe(true)
    expect(data.version).toBe(1)
  })

  it('can read a pad', async () => {
    const request = new Request(`http://example.com/r/${roomId}/${secret}/pads/mypad`)
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.content).toBe('Hello World')
    expect(data.version).toBe(1)
  })

  it('can append to a pad', async () => {
    const request = new Request(`http://example.com/r/${roomId}/${secret}/pads/mypad/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '!' })
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.success).toBe(true)
    expect(data.version).toBe(2)
  })

  it('reading pad shows appended content', async () => {
    const request = new Request(`http://example.com/r/${roomId}/${secret}/pads/mypad`)
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.content).toBe('Hello World!')
    expect(data.version).toBe(2)
  })

  it('fails with wrong secret', async () => {
    const request = new Request(`http://example.com/r/${roomId}/wrongsecret/pads/mypad`)
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(401)
  })

  it('deletes the pad', async () => {
    const request = new Request(`http://example.com/r/${roomId}/${secret}/pads/mypad`, {
      method: 'DELETE'
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
  })

  it('cannot find the pad anymore', async () => {
    const request = new Request(`http://example.com/r/${roomId}/${secret}/pads/mypad`)
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(404)
  })

  it('handles concurrent creates and appends', async () => {
    const ctx = createExecutionContext()
    const req1 = new Request(`http://example.com/r/${roomId}/${secret}/pads/concurrent`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'A' })
    })
    const req2 = new Request(`http://example.com/r/${roomId}/${secret}/pads/concurrent/append`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'B' })
    })
    const req3 = new Request(`http://example.com/r/${roomId}/${secret}/pads/concurrent/append`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'C' })
    })

    // Create pad first so appends don't 404
    await worker.fetch(req1, env, ctx)

    // Now send appends concurrently
    const [res2, res3] = await Promise.all([
      worker.fetch(req2, env, ctx),
      worker.fetch(req3, env, ctx)
    ])
    await waitOnExecutionContext(ctx)

    expect(res2.status).toBe(200)
    expect(res3.status).toBe(200)

    const req4 = new Request(`http://example.com/r/${roomId}/${secret}/pads/concurrent`)
    const res4 = await worker.fetch(req4, env, ctx)
    const data4 = await res4.json() as any
    expect(data4.content.length).toBe(3) // A + B + C
    expect(data4.content).toContain('B')
    expect(data4.content).toContain('C')
    expect(data4.version).toBe(3)
  })
})

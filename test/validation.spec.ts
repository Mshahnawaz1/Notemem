import { describe, it, expect } from 'vitest'
import { call, createRoom, postJson, putJson } from './helpers'

interface Revision { version: number; source: string; content: string }

describe('input validation', () => {
  it.each([
    ['too long', 'a'.repeat(65)],
    ['a space', 'my%20pad'],
    ['a leading dot', '.hidden'],
    ['an encoded slash', 'a%2Fb'],
    ['unicode', '%C3%A9t%C3%A9'],
  ])('rejects a pad name with %s with 400', async (_label, name) => {
    const room = await createRoom()
    const put = await putJson(`${room.base}/pads/${name}`, { content: 'x' })
    expect(put.status).toBe(400)
    expect((await put.json<{ error: string }>()).error).toMatch(/Pad names/)
    expect((await call(`${room.base}/pads/${name}`)).status).toBe(400)
    expect((await postJson(`${room.base}/pads/${name}/append`, { text: 'x' })).status).toBe(400)
  })

  it('accepts a 64-character name with dots, dashes and underscores', async () => {
    const room = await createRoom()
    const name = `a.b-c_${'d'.repeat(58)}`
    expect(name.length).toBe(64)
    expect((await putJson(`${room.base}/pads/${name}`, { content: 'x' })).status).toBe(200)
  })

  it('returns 400 for malformed JSON and wrong body shapes', async () => {
    const room = await createRoom()
    const malformed = await call(`${room.base}/pads/a`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{not json',
    })
    expect(malformed.status).toBe(400)
    expect((await putJson(`${room.base}/pads/a`, { text: 'wrong field' })).status).toBe(400)
    expect((await putJson(`${room.base}/pads/a`, { content: 42 })).status).toBe(400)
    await putJson(`${room.base}/pads/a`, { content: 'x' })
    expect((await postJson(`${room.base}/pads/a/append`, { content: 'wrong field' })).status).toBe(400)
  })

  it('returns 400 for a non-numeric If-Match', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/a`, { content: 'x' })
    expect((await putJson(`${room.base}/pads/a`, { content: 'y' }, { 'If-Match': 'abc' })).status).toBe(400)
  })

  it('accepts quoted and unquoted If-Match, and 409 reports the current version', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/a`, { content: 'v1' })
    expect((await putJson(`${room.base}/pads/a`, { content: 'v2' }, { 'If-Match': '1' })).status).toBe(200)
    expect((await putJson(`${room.base}/pads/a`, { content: 'v3' }, { 'If-Match': '"2"' })).status).toBe(200)

    const stale = await putJson(`${room.base}/pads/a`, { content: 'stale' }, { 'If-Match': '1' })
    expect(stale.status).toBe(409)
    const body = await stale.json<{ error: string; currentVersion: number }>()
    expect(body.currentVersion).toBe(3)
    expect(body.error).toMatch(/Re-read/)
  })

  it('records the source of each revision', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/a`, { content: 'api' })
    await postJson(`${room.base}/pads/a/append`, { text: ' web' }, { 'X-Notemem-Source': 'web' })
    // Only "web" is honored; nothing over HTTP can claim to be MCP.
    await postJson(`${room.base}/pads/a/append`, { text: ' fake' }, { 'X-Notemem-Source': 'mcp' })

    const { revisions } = await (await call(`${room.base}/pads/a/history`)).json<{ revisions: Revision[] }>()
    expect(revisions.map((r) => [r.version, r.source, r.content])).toEqual([
      [3, 'api', 'api web fake'],
      [2, 'web', 'api web'],
      [1, 'api', 'api'],
    ])
  })
})

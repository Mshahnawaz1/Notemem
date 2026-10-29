import { env, runInDurableObject } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { DEFAULT_LIMITS, PadStore } from '../src/lib/pads'
import { call, createRoom, postJson, putJson, readPad } from './helpers'

function putText(path: string, text: string, headers: Record<string, string> = {}): Promise<Response> {
  return call(path, { method: 'PUT', headers: { 'Content-Type': 'text/plain', ...headers }, body: text })
}

function appendText(path: string, text: string, headers: Record<string, string> = {}): Promise<Response> {
  return call(`${path}/append`, { method: 'POST', headers: { 'Content-Type': 'text/plain', ...headers }, body: text })
}

describe('pad reads', () => {
  it('returns raw text with the version in the ETag', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/a`, { content: '# Title\n<script>x</script>' })
    await postJson(`${room.base}/pads/a/append`, { text: '\nmore' })

    const response = await call(`${room.base}/pads/a`)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('ETag')).toBe('"2"')
    expect(await response.text()).toBe('# Title\n<script>x</script>\nmore')
  })

  it('returns JSON only when asked for it', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/a`, { content: 'hello' })
    const response = await call(`${room.base}/pads/a`, { headers: { Accept: 'application/json' } })
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/)
    expect(response.headers.get('ETag')).toBe('"1"')
    expect(await response.json()).toMatchObject({ name: 'a', content: 'hello', version: 1 })
  })

  it('accepts the ETag as If-Match on the next write', async () => {
    const room = await createRoom()
    const created = await putText(`${room.base}/pads/a`, 'v1')
    const etag = created.headers.get('ETag') ?? ''
    expect(etag).toBe('"1"')
    const replaced = await putText(`${room.base}/pads/a`, 'v2', { 'If-Match': etag })
    expect(replaced.status).toBe(200)
    expect(replaced.headers.get('ETag')).toBe('"2"')
  })
})

describe('PUT preconditions', () => {
  it('returns 428 when replacing an existing pad without If-Match, and changes nothing', async () => {
    const room = await createRoom()
    await putText(`${room.base}/pads/a`, 'original')
    const response = await putText(`${room.base}/pads/a`, 'overwrite')
    expect(response.status).toBe(428)
    expect((await response.json<{ error: string }>()).error).toMatch(/Re-read the pad.*If-Match/)
    expect(await readPad(`${room.base}/pads/a`)).toEqual({ content: 'original', version: 1 })
  })

  it('creates a new pad with no precondition header', async () => {
    const room = await createRoom()
    const response = await putText(`${room.base}/pads/a`, 'x')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, version: 1 })
  })

  it('creates with If-None-Match: * and returns 412 if the pad exists', async () => {
    const room = await createRoom()
    expect((await putText(`${room.base}/pads/a`, 'first', { 'If-None-Match': '*' })).status).toBe(200)
    const again = await putText(`${room.base}/pads/a`, 'second', { 'If-None-Match': '*' })
    expect(again.status).toBe(412)
    expect((await again.json<{ error: string }>()).error).toMatch(/already exists.*If-Match/)
    expect((await readPad(`${room.base}/pads/a`)).content).toBe('first')
  })

  it('returns 409 with currentVersion on a stale If-Match', async () => {
    const room = await createRoom()
    await putText(`${room.base}/pads/a`, 'v1')
    await appendText(`${room.base}/pads/a`, '+')
    const stale = await putText(`${room.base}/pads/a`, 'stale', { 'If-Match': '1' })
    expect(stale.status).toBe(409)
    const body = await stale.json<{ error: string; currentVersion: number }>()
    expect(body.currentVersion).toBe(2)
    expect(body.error).toMatch(/Re-read the pad.*If-Match: 2/)
  })

  it('returns 409 with a null currentVersion when If-Match names a pad that does not exist', async () => {
    const room = await createRoom()
    const response = await putText(`${room.base}/pads/gone`, 'x', { 'If-Match': '1' })
    expect(response.status).toBe(409)
    const body = await response.json<{ error: string; currentVersion: null }>()
    expect(body.currentVersion).toBeNull()
    expect(body.error).toMatch(/If-None-Match: \*/)
    expect((await call(`${room.base}/pads/gone`)).status).toBe(404)
  })

  it('returns 400 for If-None-Match other than *, and for both headers at once', async () => {
    const room = await createRoom()
    expect((await putText(`${room.base}/pads/a`, 'x', { 'If-None-Match': '"1"' })).status).toBe(400)
    expect((await putText(`${room.base}/pads/a`, 'x', { 'If-None-Match': '*', 'If-Match': '1' })).status).toBe(400)
    expect((await call(`${room.base}/pads/a`)).status).toBe(404)
  })

  it('lets exactly one of several concurrent If-None-Match: * creates win', async () => {
    const room = await createRoom()
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => putText(`${room.base}/pads/race`, `writer ${i}`, { 'If-None-Match': '*' }))
    )
    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 412)).toHaveLength(5)
    const winner = statuses.indexOf(200)
    expect(await readPad(`${room.base}/pads/race`)).toEqual({ content: `writer ${winner}`, version: 1 })
  })
})

describe('append', () => {
  it('creates the pad if it is missing', async () => {
    const room = await createRoom()
    const response = await appendText(`${room.base}/pads/new`, 'first line')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, version: 1 })
    expect(await readPad(`${room.base}/pads/new`)).toEqual({ content: 'first line', version: 1 })
    const { revisions } = await (await call(`${room.base}/pads/new/history`)).json<{ revisions: { version: number; content: string }[] }>()
    expect(revisions).toEqual([expect.objectContaining({ version: 1, content: 'first line' })])
  })

  it('creates one pad from concurrent appends to a missing pad, keeping every append', async () => {
    const room = await createRoom()
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => appendText(`${room.base}/pads/log`, String(i))))
    expect(results.every((r) => r.status === 200)).toBe(true)
    const pad = await readPad(`${room.base}/pads/log`)
    expect(pad.version).toBe(8)
    expect(pad.content.split('').sort().join('')).toBe('01234567')
  })

  it('still counts toward the pad cap and the size limit', async () => {
    const room = await createRoom()
    const stub = env.ROOM.get(env.ROOM.idFromName(room.roomId))
    await runInDurableObject(stub, (_instance, state) => {
      const store = new PadStore(state.storage, { ...DEFAULT_LIMITS, maxPads: 1, maxPadBytes: 4 })
      expect(store.append('a', 'abc', 'api')).toEqual({ ok: true, version: 1 })
      expect(store.append('b', 'x', 'api')).toMatchObject({ ok: false, error: 'pad_limit' })
      expect(store.append('a', 'de', 'api')).toMatchObject({ ok: false, error: 'too_large' })
      expect(store.list().map((p) => p.name)).toEqual(['a'])
    })
  })
})

describe('write bodies', () => {
  it('accepts text/plain bodies for PUT and append, with or without a charset', async () => {
    const room = await createRoom()
    expect((await putText(`${room.base}/pads/a`, 'line 1\n', { 'Content-Type': 'text/plain; charset=utf-8' })).status).toBe(200)
    expect((await appendText(`${room.base}/pads/a`, 'line 2 {"not": "json"}\n')).status).toBe(200)
    expect((await readPad(`${room.base}/pads/a`)).content).toBe('line 1\nline 2 {"not": "json"}\n')
  })

  it('accepts JSON bodies', async () => {
    const room = await createRoom()
    expect((await putJson(`${room.base}/pads/a`, { content: 'x' })).status).toBe(200)
    expect((await postJson(`${room.base}/pads/a/append`, { text: 'y' }, { 'Content-Type': 'application/json; charset=utf-8' })).status).toBe(200)
    expect((await readPad(`${room.base}/pads/a`)).content).toBe('xy')
  })

  it('treats a body with no Content-Type as text', async () => {
    const room = await createRoom()
    const body = new TextEncoder().encode('raw bytes')
    expect((await call(`${room.base}/pads/a`, { method: 'PUT', body })).status).toBe(200)
    expect((await readPad(`${room.base}/pads/a`)).content).toBe('raw bytes')
  })

  it('accepts an empty text body', async () => {
    const room = await createRoom()
    expect((await putText(`${room.base}/pads/a`, '')).status).toBe(200)
    expect(await readPad(`${room.base}/pads/a`)).toEqual({ content: '', version: 1 })
  })

  it('returns 415 for other content types', async () => {
    const room = await createRoom()
    const response = await call(`${room.base}/pads/a`, {
      method: 'PUT', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'content=x',
    })
    expect(response.status).toBe(415)
    expect((await response.json<{ error: string }>()).error).toMatch(/text\/plain/)
    expect((await call(`${room.base}/pads/a`)).status).toBe(404)
  })

  it('returns 400, not 500, for malformed JSON on append and for a JSON body of the wrong type', async () => {
    const room = await createRoom()
    const malformed = await call(`${room.base}/pads/a/append`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text": ',
    })
    expect(malformed.status).toBe(400)
    expect((await malformed.json<{ error: string }>()).error).toMatch(/valid JSON/)
    expect((await postJson(`${room.base}/pads/a/append`, 'just a string')).status).toBe(400)
    expect((await putJson(`${room.base}/pads/a`, null)).status).toBe(400)
  })
})

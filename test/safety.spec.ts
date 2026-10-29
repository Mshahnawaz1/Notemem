import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { HTML_CSP, DATA_CSP } from '../src/lib/headers'
import { redactSecrets } from '../src/lib/keys'
import { initSchema } from '../src/lib/db'
import { INACTIVITY_MS } from '../src/lib/expiry'
import { call, createRoom, postJson, putJson } from './helpers'
import type { TestRoom } from './helpers'

const DAY_MS = 24 * 60 * 60 * 1000
const BROWSER = { 'Sec-Fetch-Dest': 'document', Accept: 'text/html' }

function stub(roomId: string) {
  return env.ROOM.get(env.ROOM.idFromName(roomId))
}

/** The room's stored expiry and its scheduled alarm, both in ms since the epoch. */
function expiry(roomId: string): Promise<{ expiresAt: number | null; alarm: number | null }> {
  return runInDurableObject(stub(roomId), async (_room, state) => ({
    expiresAt: state.storage.sql.exec<{ expires_at: number }>('SELECT expires_at FROM room').toArray()[0]?.expires_at ?? null,
    alarm: await state.storage.getAlarm(),
  }))
}

/** Pretends the expiry was last extended `days` days ago. */
async function ageExpiry(room: TestRoom, days: number): Promise<number> {
  const aged = Date.now() + INACTIVITY_MS - days * DAY_MS
  await runInDurableObject(stub(room.roomId), async (_room, state) => {
    state.storage.sql.exec('UPDATE room SET expires_at = ?', aged)
    await state.storage.setAlarm(aged)
  })
  return aged
}

async function listedExpiry(room: TestRoom): Promise<string | null> {
  const response = await call(`${room.base}/pads`)
  return (await response.json<{ expires_at: string | null }>()).expires_at
}

describe('security headers', () => {
  it('sets the leak-prevention headers and a locked-down CSP on API responses, including errors', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'x' })
    const responses = [
      await call('/api/rooms', { method: 'POST' }),
      await call(room.base),
      await call(`${room.base}/pads`),
      await call(`${room.base}/pads/plan`),
      await call(`/r/${room.roomId}/${'0'.repeat(32)}`),
      await putJson(`${room.readBase}/pads/plan`, { content: 'y' }),
      await call(`/r/${'0'.repeat(12)}/${room.writeSecret}`),
      await call('/nope'),
      await call(`/mcp/${room.roomId}/${room.writeSecret}`),
    ]
    for (const response of responses) {
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
      expect(response.headers.get('Content-Security-Policy')).toBe(DATA_CSP)
    }
  })

  it('gives the SPA a strict CSP that allows only its own scripts', async () => {
    const room = await createRoom()
    const response = await call(room.base, { headers: BROWSER })
    expect(response.headers.get('Content-Type')).toMatch(/^text\/html/)
    expect(response.headers.get('Content-Security-Policy')).toBe(HTML_CSP)
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(HTML_CSP).toContain("script-src 'self';")
    expect(HTML_CSP).not.toContain('unsafe-')
    // Inline styles would be blocked, so the embedded agent page must not use one.
    expect(await response.text()).not.toMatch(/style="/)
  })

  it('keeps the WebSocket upgrade working', async () => {
    const room = await createRoom()
    const response = await call(`${room.base}/ws`, { headers: { Upgrade: 'websocket' } })
    expect(response.status).toBe(101)
    response.webSocket?.accept()
    response.webSocket?.close()
  })
})

describe('unknown rooms', () => {
  it('return 404 and store nothing, whatever the request', async () => {
    const roomId = 'abcdef123456'
    const secret = '1'.repeat(32)
    const requests = [
      call(`/r/${roomId}/${secret}`),
      call(`/r/${roomId}/${secret}`, { headers: BROWSER }),
      call(`/r/${roomId}/${secret}/pads`),
      putJson(`/r/${roomId}/${secret}/pads/plan`, { content: 'x' }),
      postJson(`/r/${roomId}/${secret}/pads/plan/append`, { text: 'x' }),
      postJson(`/mcp/${roomId}/${secret}`, { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    ]
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(404)
      expect((await response.json<{ error: string }>()).error).toContain('Room not found')
    }
    const stored = await runInDurableObject(stub(roomId), async (_room, state) => ({
      tables: state.storage.sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE name NOT LIKE '_cf_%'")
        .toArray(),
      alarm: await state.storage.getAlarm(),
    }))
    expect(stored).toEqual({ tables: [], alarm: null })
  })

  it('include rooms deleted by their alarm', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'x' })
    // Only the stored expiry is moved into the past; an alarm set in the past would fire by itself.
    await runInDurableObject(stub(room.roomId), (_room, state) => {
      state.storage.sql.exec('UPDATE room SET expires_at = ?', Date.now() - 1000)
    })
    expect(await runDurableObjectAlarm(stub(room.roomId))).toBe(true)
    expect((await call(room.base)).status).toBe(404)
    expect((await putJson(`${room.base}/pads/plan`, { content: 'y' })).status).toBe(404)
    const left = await runInDurableObject(stub(room.roomId), async (_room, state) => ({
      tables: state.storage.sql.exec("SELECT name FROM sqlite_master WHERE name NOT LIKE '_cf_%'").toArray(),
      alarm: await state.storage.getAlarm(),
    }))
    expect(left).toEqual({ tables: [], alarm: null })
  })
})

describe('expiry', () => {
  it('is set to 30 days at creation and returned by the API', async () => {
    const before = Date.now()
    const room = await createRoom()
    const { expiresAt, alarm } = await expiry(room.roomId)
    expect(expiresAt).toBeGreaterThanOrEqual(before + INACTIVITY_MS)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + INACTIVITY_MS)
    expect(alarm).toBe(expiresAt)
    expect(await listedExpiry(room)).toBe(new Date(expiresAt!).toISOString())
  })

  it('is shown on the agent page', async () => {
    const room = await createRoom()
    const { expiresAt } = await expiry(room.roomId)
    const page = await (await call(room.readBase)).text()
    const shown = new Date(expiresAt!).toISOString().slice(0, 16).replace('T', ' ')
    expect(page).toContain(`scheduled for deletion on ${shown} UTC unless a pad is changed before then`)
  })

  it('is not extended by reads or rejected writes', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'x' })
    const aged = await ageExpiry(room, 5)
    await call(room.base)
    await call(room.readBase, { headers: BROWSER })
    await call(`${room.base}/pads/plan`)
    await call(`${room.base}/pads/plan/history`)
    await putJson(`${room.readBase}/pads/plan`, { content: 'y' }, { 'If-Match': '1' })
    await putJson(`/r/${room.roomId}/${'0'.repeat(32)}/pads/plan`, { content: 'y' }, { 'If-Match': '1' })
    await putJson(`${room.base}/pads/plan`, { content: 'y' }, { 'If-Match': '7' })
    await call(`${room.base}/pads/missing`, { method: 'DELETE' })
    expect(await expiry(room.roomId)).toEqual({ expiresAt: aged, alarm: aged })
  })

  it('is extended by a committed write at most once a day', async () => {
    const room = await createRoom()
    const created = await expiry(room.roomId)
    await postJson(`${room.base}/pads/plan/append`, { text: 'a' })
    expect(await expiry(room.roomId)).toEqual(created)

    await ageExpiry(room, 2)
    const before = Date.now()
    await postJson(`${room.base}/pads/plan/append`, { text: 'b' })
    const extended = await expiry(room.roomId)
    expect(extended.expiresAt).toBeGreaterThanOrEqual(before + INACTIVITY_MS)
    expect(extended.alarm).toBe(extended.expiresAt)
  })

  it('is extended by MCP writes too', async () => {
    const room = await createRoom()
    const aged = await ageExpiry(room, 2)
    const response = await postJson(
      `/mcp/${room.roomId}/${room.writeSecret}`,
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'append_pad', arguments: { name: 'log', text: 'x' } } },
      { Accept: 'application/json, text/event-stream' }
    )
    expect(response.status).toBe(200)
    expect((await expiry(room.roomId)).expiresAt).toBeGreaterThan(aged)
  })

  it('reschedules instead of deleting when the alarm fires before the stored expiry', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'x' })
    const { expiresAt } = await expiry(room.roomId)
    // Fires the alarm now, while the stored expiry is still 30 days away.
    expect(await runDurableObjectAlarm(stub(room.roomId))).toBe(true)
    expect(await expiry(room.roomId)).toEqual({ expiresAt, alarm: expiresAt })
    expect((await call(`${room.base}/pads/plan`)).status).toBe(200)
  })
})

describe('schema migration', () => {
  it('gives a room created before expires_at existed a fresh 30 days', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'x' })
    const before = Date.now()
    await runInDurableObject(stub(room.roomId), (_room, state) => {
      state.storage.sql.exec('ALTER TABLE room DROP COLUMN expires_at')
      initSchema(state.storage.sql)
    })
    expect((await expiry(room.roomId)).expiresAt).toBeGreaterThanOrEqual(before + INACTIVITY_MS)
    expect(await call(`${room.base}/pads/plan`).then((r) => r.text())).toBe('x')
  })
})

describe('secrets', () => {
  it('never appear in error responses', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/plan`, { content: 'x' })
    const wrong = 'f'.repeat(32)
    const responses = [
      await call(`/r/${room.roomId}/${wrong}`),
      await call(`/r/${room.roomId}/${wrong}`, { headers: BROWSER }),
      await putJson(`${room.readBase}/pads/plan`, { content: 'y' }),
      await putJson(`${room.base}/pads/plan`, { content: 'y' }),
      await putJson(`${room.base}/pads/plan`, { content: 'y' }, { 'If-Match': '9' }),
      await putJson(`${room.base}/pads/bad name`, { content: 'y' }),
      await call(`${room.base}/pads/plan`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' }),
      await call(`${room.base}/pads/missing`),
      await call(`${room.base}/ws`),
      await call(`/mcp/${room.roomId}/${room.writeSecret}`),
    ]
    for (const response of responses) {
      expect(response.status).toBeGreaterThanOrEqual(400)
      const body = await response.text()
      for (const secret of [room.readSecret, room.writeSecret, wrong]) expect(body).not.toContain(secret)
    }
  })

  it('are redacted from log text', () => {
    const secret = '0123456789abcdef0123456789ABCDEF'
    expect(redactSecrets(`fetch failed: https://x.dev/r/abcdef123456/${secret}/pads/a`)).toBe(
      'fetch failed: https://x.dev/r/abcdef123456/<redacted>/pads/a'
    )
    // Room IDs (12 hex characters) are routing data, not secrets.
    expect(redactSecrets('/r/abcdef123456')).toBe('/r/abcdef123456')
  })
})

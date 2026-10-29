import { env, runInDurableObject } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { DEFAULT_LIMITS, PadStore } from '../src/lib/pads'
import type { PadLimits } from '../src/lib/pads'
import { call, createRoom, postJson, putJson, readPad } from './helpers'

interface StoredRevision extends Record<string, SqlStorageValue> {
  pad_name: string
  version: number
  kind: string
  content: string
  bytes: number
}

/** Runs `fn` inside a fresh room's Durable Object with a PadStore using `limits`. */
async function withStore<T>(limits: Partial<PadLimits>, fn: (store: PadStore, sql: SqlStorage) => T): Promise<T> {
  const room = await createRoom()
  const stub = env.ROOM.get(env.ROOM.idFromName(room.roomId))
  return runInDurableObject(stub, (_instance, state) =>
    fn(new PadStore(state.storage, { ...DEFAULT_LIMITS, ...limits }), state.storage.sql)
  )
}

function stored(sql: SqlStorage, pad: string): StoredRevision[] {
  return sql
    .exec<StoredRevision>(`SELECT pad_name, version, kind, content, bytes FROM revisions WHERE pad_name = ? ORDER BY version`, pad)
    .toArray()
}

function recordedBytes(sql: SqlStorage): { counter: number; actual: number } {
  return {
    counter: sql.exec<{ history_bytes: number }>(`SELECT history_bytes FROM room`).one().history_bytes,
    actual: sql.exec<{ total: number | null }>(`SELECT SUM(bytes) AS total FROM revisions`).one().total ?? 0,
  }
}

describe('revision history', () => {
  it('stores appends as deltas and rebuilds full content', async () => {
    await withStore({}, (store, sql) => {
      store.replace('a', 'one', 'api')
      store.append('a', ' two', 'mcp')
      store.append('a', ' three', 'web')
      expect(stored(sql, 'a').map((r) => [r.kind, r.content])).toEqual([
        ['full', 'one'],
        ['delta', ' two'],
        ['delta', ' three'],
      ])
      expect(store.history('a').map((r) => [r.version, r.content, r.source])).toEqual([
        [3, 'one two three', 'web'],
        [2, 'one two', 'mcp'],
        [1, 'one', 'api'],
      ])
      expect(recordedBytes(sql)).toEqual({ counter: 3 + 4 + 6, actual: 13 })
    })
  })

  it('trims to the per-pad cap and rewrites the oldest kept delta as a full snapshot', async () => {
    await withStore({ maxRevisionsPerPad: 3 }, (store, sql) => {
      store.replace('a', 'A', 'api')
      for (const t of ['B', 'C', 'D', 'E']) store.append('a', t, 'api')

      const rows = stored(sql, 'a')
      expect(rows.map((r) => [r.version, r.kind, r.content])).toEqual([
        [3, 'full', 'ABC'],
        [4, 'delta', 'D'],
        [5, 'delta', 'E'],
      ])
      expect(store.history('a').map((r) => [r.version, r.content])).toEqual([
        [5, 'ABCDE'],
        [4, 'ABCD'],
        [3, 'ABC'],
      ])
      const { counter, actual } = recordedBytes(sql)
      expect(counter).toBe(actual)
    })
  })

  it('trims oldest revisions room-wide to the history budget but keeps each pad latest', async () => {
    await withStore({ maxHistoryBytes: 25 }, (store, sql) => {
      store.replace('old', '0123456789', 'api') // 10 bytes, oldest
      store.replace('old', 'abcdefghij', 'api', 1) // 20
      store.replace('new', 'ABCDEFGHIJ', 'api') // 30 -> drops old v1
      expect(store.history('old').map((r) => r.version)).toEqual([2])
      expect(store.history('new').map((r) => r.version)).toEqual([1])
      expect(recordedBytes(sql)).toEqual({ counter: 20, actual: 20 })

      // Over budget with only latest revisions left: nothing more can go.
      store.replace('third', 'x'.repeat(10), 'api')
      expect(store.history('third').map((r) => r.version)).toEqual([1])
      expect(store.history('old').map((r) => r.version)).toEqual([2])
      expect(recordedBytes(sql).counter).toBe(30)
    })
  })

  it('does not collapse an append chain that the budget cannot shrink', async () => {
    await withStore({ maxHistoryBytes: 12 }, (store, sql) => {
      store.replace('a', 'base', 'api') // 4
      for (let i = 1; i <= 5; i++) store.append('a', `+${i}`, 'api') // 14 bytes total, same as the content
      // Dropping part of a delta chain would free nothing, so all revisions stay.
      expect(store.history('a').map((r) => r.version)).toEqual([6, 5, 4, 3, 2, 1])
      expect(recordedBytes(sql)).toEqual({ counter: 14, actual: 14 })
    })
  })

  it('drops a whole old append chain once a newer snapshot exists, keeping the rest restorable', async () => {
    await withStore({ maxHistoryBytes: 30 }, (store, sql) => {
      store.replace('a', 'base', 'api') // 4
      for (let i = 1; i <= 5; i++) store.append('a', `+${i}`, 'api') // 14
      store.replace('a', 'fresh', 'api', 6) // 19
      store.append('a', '!', 'api') // 20
      store.replace('b', 'x'.repeat(12), 'api') // 32 -> drops a's first segment (14 bytes)

      expect(stored(sql, 'a').map((r) => [r.version, r.kind])).toEqual([
        [7, 'full'],
        [8, 'delta'],
      ])
      expect(store.history('a').map((r) => [r.version, r.content])).toEqual([
        [8, 'fresh!'],
        [7, 'fresh'],
      ])
      expect(recordedBytes(sql)).toEqual({ counter: 18, actual: 18 })
    })
  })

  it('frees history bytes when a pad is deleted', async () => {
    await withStore({}, (store, sql) => {
      store.replace('a', 'hello', 'api')
      store.append('a', ' world', 'api')
      store.replace('b', 'keep', 'api')
      expect(store.delete('a')).toBe(true)
      expect(recordedBytes(sql)).toEqual({ counter: 4, actual: 4 })
      expect(store.history('a')).toEqual([])
      expect(store.delete('a')).toBe(false)
    })
  })

  it('a pad recreated after deletion starts with a full snapshot', async () => {
    await withStore({}, (store, sql) => {
      store.replace('a', 'one', 'api')
      store.delete('a')
      store.replace('a', 'two', 'api')
      store.append('a', '!', 'api')
      expect(stored(sql, 'a').map((r) => r.kind)).toEqual(['full', 'delta'])
    })
  })

  it('caps history at 50 revisions per pad over HTTP and restores the oldest kept version', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/log`, { content: 'start\n' })
    for (let i = 1; i <= 54; i++) {
      await postJson(`${room.base}/pads/log/append`, { text: `line ${i}\n` })
    }
    const { revisions } = await (await call(`${room.base}/pads/log/history`)).json<{
      revisions: { version: number; content: string }[]
    }>()
    expect(revisions).toHaveLength(50)
    expect(revisions[0].version).toBe(55)
    const oldest = revisions[revisions.length - 1]
    expect(oldest.version).toBe(6)
    expect(oldest.content).toBe('start\n' + Array.from({ length: 5 }, (_, i) => `line ${i + 1}\n`).join(''))

    // Restoring is a replace with the old content.
    const restore = await putJson(`${room.base}/pads/log`, { content: oldest.content }, { 'If-Match': '55' })
    expect(restore.status).toBe(200)
    const pad = await readPad(`${room.base}/pads/log`)
    expect(pad).toMatchObject({ content: oldest.content, version: 56 })
  })

  it('serializes concurrent appends and replaces without losing writes', async () => {
    const room = await createRoom()
    await putJson(`${room.base}/pads/c`, { content: '' })
    const appends = Array.from({ length: 20 }, (_, i) => postJson(`${room.base}/pads/c/append`, { text: `${i},` }))
    const replaces = Array.from({ length: 5 }, () => putJson(`${room.base}/pads/c`, { content: 'R' }, { 'If-Match': '1' }))
    const results = await Promise.all([...appends, ...replaces])
    const statuses = results.map((r) => r.status)
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true)
    // At most one replace can win against version 1; the rest conflict.
    expect(statuses.slice(20).filter((s) => s === 200).length).toBeLessThanOrEqual(1)
    expect(statuses.slice(20).every((s) => s === 200 || s === 409)).toBe(true)

    const pad = await readPad(`${room.base}/pads/c`)
    const winners = statuses.filter((s) => s === 200).length
    expect(pad.version).toBe(1 + winners)
    const { revisions } = await (await call(`${room.base}/pads/c/history`)).json<{ revisions: { version: number }[] }>()
    expect(revisions.map((r) => r.version)).toEqual(Array.from({ length: winners + 1 }, (_, i) => winners + 1 - i))
  })
})

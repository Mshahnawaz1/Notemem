import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../src/index'

export interface TestRoom {
  roomId: string
  readSecret: string
  writeSecret: string
  /** Path of the write URL, e.g. `/r/{roomId}/{writeSecret}`. */
  base: string
  /** Path of the read-only URL. */
  readBase: string
}

export async function call(input: string, init?: RequestInit): Promise<Response> {
  const url = input.startsWith('http') ? input : `http://example.com${input}`
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(url, init), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

export async function createRoom(): Promise<TestRoom> {
  const response = await call('/api/rooms', { method: 'POST' })
  if (response.status !== 200) throw new Error(`createRoom failed: ${response.status}`)
  const { roomId, readUrl, writeUrl } = await response.json<{ roomId: string; readUrl: string; writeUrl: string }>()
  const base = new URL(writeUrl).pathname
  const readBase = new URL(readUrl).pathname
  return { roomId, readSecret: readBase.split('/')[3], writeSecret: base.split('/')[3], base, readBase }
}

export function putJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return call(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

export function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

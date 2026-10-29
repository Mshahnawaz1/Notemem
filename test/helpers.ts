import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../src/index'

export interface TestRoom {
  roomId: string
  secret: string
  base: string
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
  const { roomId, secret } = await response.json<{ roomId: string; secret: string }>()
  return { roomId, secret, base: `/r/${roomId}/${secret}` }
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

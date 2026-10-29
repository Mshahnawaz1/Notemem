import { Hono } from 'hono'
import { generateRoomId, generateSecret, hashSecret } from './lib/keys'
import { Room } from './room'

export { Room }

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Main API to create a room
app.post('/api/rooms', async (c) => {
  const roomId = generateRoomId()
  const readSecret = generateSecret()
  const writeSecret = generateSecret()

  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(roomId))
  const created = await stub.init({ readHash: await hashSecret(readSecret), writeHash: await hashSecret(writeSecret) })
  if (!created) {
    return c.json({ error: 'Failed to create room' }, 500)
  }

  // The raw secrets are only ever returned here.
  const origin = new URL(c.req.url).origin
  return c.json({
    roomId,
    readUrl: `${origin}/r/${roomId}/${readSecret}`,
    writeUrl: `${origin}/r/${roomId}/${writeSecret}`,
  })
})

// TEMPORARY (Phase V): log request headers to pick the browser-detection signal. Remove after the spike.
app.use('/r/*', async (c, next) => {
  const path = new URL(c.req.url).pathname.replace(/^(\/r\/[^/]+\/)[^/]+/, '$1<redacted>')
  console.log(JSON.stringify({
    spike: 'headers',
    method: c.req.method,
    path,
    accept: c.req.header('Accept') ?? null,
    secFetchDest: c.req.header('Sec-Fetch-Dest') ?? null,
    secFetchMode: c.req.header('Sec-Fetch-Mode') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  }))
  await next()
})

// Forward all /r/* and /mcp/* requests to the appropriate DO
app.all('/r/:roomId/*', async (c) => {
  const roomId = c.req.param('roomId')
  const id = c.env.ROOM.idFromName(roomId)
  const stub = c.env.ROOM.get(id)
  
  // Forward the exact request
  return stub.fetch(c.req.raw)
})

app.all('/mcp/:roomId/*', async (c) => {
  const roomId = c.req.param('roomId')
  const id = c.env.ROOM.idFromName(roomId)
  const stub = c.env.ROOM.get(id)
  
  return stub.fetch(c.req.raw)
})

export default app

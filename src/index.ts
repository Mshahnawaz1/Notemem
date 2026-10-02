import { Hono } from 'hono'
import { Room } from './room'

export { Room }

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Generate a random string
const generateRandomString = (length: number) => {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, length)
}

// Main API to create a room
app.post('/api/rooms', async (c) => {
  const roomId = generateRandomString(12)
  const secret = generateRandomString(32)
  
  // Forward to DO to initialize
  const id = c.env.ROOM.idFromName(roomId)
  const stub = c.env.ROOM.get(id)
  
  const initReq = new Request(`http://internal/init`, {
    method: 'POST',
    body: JSON.stringify({ secret }),
    headers: { 'Content-Type': 'application/json' }
  })
  
  const res = await stub.fetch(initReq)
  if (!res.ok) {
    return c.json({ error: 'Failed to create room' }, 500)
  }
  
  return c.json({ roomId, secret })
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

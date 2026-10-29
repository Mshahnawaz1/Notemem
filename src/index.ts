import { Hono } from 'hono'
import type { Context } from 'hono'
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

function roomStub(env: CloudflareBindings, roomId: string) {
  return env.ROOM.get(env.ROOM.idFromName(roomId))
}

/**
 * A real browser navigation, as opposed to an agent's fetch. Browsers send `Sec-Fetch-Dest: document`;
 * clients that send no `Sec-Fetch-*` headers at all count as browsers only if they ask for HTML.
 */
function isBrowserNavigation(request: Request): boolean {
  const dest = request.headers.get('Sec-Fetch-Dest')
  if (dest !== null) return dest === 'document'
  return request.headers.get('Accept')?.includes('text/html') ?? false
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The SPA shell with the agent page inside `#app`, so a fetch tool that gets HTML can still read it.
 * The SPA replaces it when it mounts.
 */
async function browserPage(c: Context<{ Bindings: CloudflareBindings }>, roomId: string, secret: string): Promise<Response> {
  const origin = new URL(c.req.url).origin
  // Asks the room for its agent page; this also checks the secret.
  const agentPage = await roomStub(c.env, roomId).fetch(`${origin}/r/${roomId}/${secret}`, { headers: { Accept: 'text/markdown' } })
  if (!agentPage.ok) return agentPage
  const markdown = await agentPage.text()

  // `/` rather than `/index.html`, which the assets layer redirects to `/`.
  const shell = await c.env.ASSETS.fetch(new URL('/', origin))
  if (!shell.ok) return shell
  const page = new HTMLRewriter()
    .on('#app', {
      element(element) {
        element.setInnerContent(`<pre style="white-space: pre-wrap">${escapeHtml(markdown)}</pre>`, { html: true })
      },
    })
    .transform(shell)
  const headers = new Headers(page.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Vary', 'Sec-Fetch-Dest, Accept')
  return new Response(page.body, { status: 200, headers })
}

// Browsers get the web UI at the room URL and its pad deep links; everything else goes to the room.
for (const path of ['/r/:roomId/:secret', '/r/:roomId/:secret/pads/:name'] as const) {
  app.get(path, (c) => {
    const { roomId, secret } = c.req.param()
    return isBrowserNavigation(c.req.raw) ? browserPage(c, roomId, secret) : roomStub(c.env, roomId).fetch(c.req.raw)
  })
}

// Forward all other /r/* and /mcp/* requests to the room's Durable Object
app.all('/r/:roomId/*', async (c) => {
  return roomStub(c.env, c.req.param('roomId')).fetch(c.req.raw)
})

app.all('/mcp/:roomId/*', async (c) => {
  return roomStub(c.env, c.req.param('roomId')).fetch(c.req.raw)
})

export default app

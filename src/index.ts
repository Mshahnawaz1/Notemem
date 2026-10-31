import { Hono } from 'hono'
import type { Context } from 'hono'
import { withSecurityHeaders } from './lib/headers'
import { deriveReadSecret, generateRoomId, generateSecret, hashSecret, redactSecrets } from './lib/keys'
import { Room } from './room'

export { Room }

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Main API to create a room
app.post('/api/rooms', async (c) => {
  const roomId = generateRoomId()
  const writeSecret = generateSecret()
  const readSecret = await deriveReadSecret(writeSecret)

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

// Google Search Console ownership check for notemem.mshahnawaz.me. Listed in `run_worker_first` in
// wrangler.jsonc, because a static file at this path would be redirected to drop `.html`.
const GOOGLE_VERIFICATION = 'google1e24adb1266cf4fc.html'
app.get(`/${GOOGLE_VERIFICATION}`, (c) => c.html(`google-site-verification: ${GOOGLE_VERIFICATION}`))

// TEMPORARY (Phase V): log request headers to pick the browser-detection signal. Remove after the spike.
app.use('/r/*', async (c, next) => {
  const path = redactSecrets(new URL(c.req.url).pathname)
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
        element.setInnerContent(`<pre>${escapeHtml(markdown)}</pre>`, { html: true })
      },
    })
    // The shell is the prerendered home page; its title, description, canonical URL and structured
    // data don't describe a room.
    .on('head [data-seo]', {
      element(element) {
        element.remove()
      },
    })
    .on('head title', {
      element(element) {
        element.setInnerContent('Notemem room')
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

/** The prerendered 404 or 500 page from the assets, with that status. */
async function errorPage(c: Context<{ Bindings: CloudflareBindings }>, status: 404 | 500): Promise<Response | null> {
  const page = await c.env.ASSETS.fetch(new URL(`/${status}`, c.req.url))
  if (!page.ok) return null
  const headers = new Headers(page.headers)
  headers.set('Cache-Control', 'no-store')
  return new Response(page.body, { status, headers })
}

app.notFound(async (c) => {
  if (c.req.method === 'GET' && isBrowserNavigation(c.req.raw)) {
    const page = await errorPage(c, 404)
    if (page) return page
  }
  return c.text('404 Not Found', 404)
})

// Hono's default handler logs the whole error, whose text can quote the URL and its secret.
app.onError(async (error, c) => {
  console.error(JSON.stringify({ error: redactSecrets(error.message) }))
  if (c.req.method === 'GET' && isBrowserNavigation(c.req.raw)) {
    const page = await errorPage(c, 500).catch(() => null)
    if (page) return page
  }
  return c.json({ error: 'Internal error' }, 500)
})

export default {
  async fetch(request: Request, env: CloudflareBindings, ctx: ExecutionContext): Promise<Response> {
    return withSecurityHeaders(await app.fetch(request, env, ctx))
  },
}

// Security headers for every response the Worker sends. Static assets the Worker never sees
// (the home page, `/assets/*`) get the same headers from `web/public/_headers`; keep them in sync.

/**
 * For the SPA. Scripts and styles come from our own `/assets`, fonts from Google Fonts, and the
 * WebSocket and the web manifest are same-origin. Pad markdown can't load third-party images, so
 * viewing a pad never tells another server that someone opened it.
 */
export const HTML_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** Everything else is data, never a document: it loads nothing and can't be framed. */
export const DATA_CSP = "default-src 'none'; frame-ancestors 'none'";

export function withSecurityHeaders(response: Response): Response {
  // A WebSocket upgrade has no body for a browser to render, and its Response can't be copied.
  if (response.status === 101) return response;
  // Responses from `fetch()` and bindings have immutable headers.
  const secured = new Response(response.body, response);
  const headers = secured.headers;
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex");
  const isHtml = headers.get("Content-Type")?.startsWith("text/html") ?? false;
  headers.set("Content-Security-Policy", isHtml ? HTML_CSP : DATA_CSP);
  return secured;
}

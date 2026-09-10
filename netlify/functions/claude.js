// Proxies requests to the Anthropic Messages API.
// The API key is held as a Netlify environment variable (ANTHROPIC_API_KEY)
// so it's never exposed to the browser.
//
// This endpoint is public and spends real money, so it is deliberately narrow:
// it does NOT forward the caller's body. It validates the request, then builds
// a fresh one from a fixed model, a fixed system prompt and a capped
// max_tokens. A caller cannot choose the model, pass tools, stream, swap the
// system prompt, or send an unbounded conversation — the endpoint can only do
// the one thing WA Reply AI needs, which makes it worth very little to anyone
// looking for free Claude access.

const DEFAULT_MODEL = "claude-sonnet-4-5";
const ALLOWED_MODELS = new Set([DEFAULT_MODEL]);

// Mirrors the system prompt the app sends; set here so the caller can't
// replace it with one of their own.
const SYSTEM_PROMPT =
  "You are a chat reply assistant. Always respond ONLY with valid JSON. No preamble, no markdown fences.";

const MAX_TOKENS_CAP = 2000;
const MAX_BODY_BYTES = 6 * 1024 * 1024;  // screenshots arrive base64-encoded
const MAX_MESSAGES = 60;                 // a long refinement session, not a corpus
const MAX_TEXT_CHARS = 120000;           // ~30k tokens of conversation
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 2 * 1024 * 1024; // per image, base64 length
const MAX_CACHE_BREAKPOINTS = 4;         // the API's own limit

// Best-effort per-IP throttle. Netlify may run several warm instances, so this
// is a speed bump rather than a hard quota — it stops one host hammering a
// single instance. A hard global cap needs shared state (Netlify Blobs or
// similar); see the note in the README-less repo root if that day comes.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 30;
const hits = new Map();

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  const allowed = isAllowedOrigin(origin, req);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: allowed ? 204 : 403,
      headers: corsHeaders(origin, allowed)
    });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405, origin, allowed);
  }
  if (!allowed) {
    // A browser can't forge Origin, so this blocks other sites embedding the
    // endpoint. It does nothing against curl — the limits below are what
    // matter there.
    return json({ error: { message: "Origin not allowed" } }, 403, origin, allowed);
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: { message: "Server is missing ANTHROPIC_API_KEY env var" } }, 500, origin, allowed);
  }

  const retryAfter = rateLimit(clientIp(req));
  if (retryAfter) {
    return json(
      { error: { message: "Too many requests — wait a moment and try again." } },
      429, origin, allowed, { "Retry-After": String(retryAfter) }
    );
  }

  let raw;
  try {
    raw = await req.text();
  } catch {
    return json({ error: { message: "Could not read request body" } }, 400, origin, allowed);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: { message: "Request too large" } }, 413, origin, allowed);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400, origin, allowed);
  }

  const checked = buildRequest(parsed);
  if (checked.error) {
    return json({ error: { message: checked.error } }, 400, origin, allowed);
  }

  let upstream, text;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(checked.body)
    });
    text = await upstream.text();
  } catch (e) {
    console.error("[claude] upstream request failed:", e);
    return json({ error: { message: "AI service unreachable. Try again shortly." } }, 502, origin, allowed);
  }

  if (!upstream.ok) {
    // Log the detail, don't hand it to the caller — upstream errors can echo
    // account and request specifics that a public endpoint shouldn't leak.
    console.error("[claude] upstream", upstream.status, text.slice(0, 500));
    const message =
      upstream.status === 429 ? "The AI service is busy — try again in a moment."
      : upstream.status >= 500 ? "AI service temporarily unavailable. Try again shortly."
      : "The AI service rejected that request.";
    return json({ error: { message } }, upstream.status, origin, allowed);
  }

  return new Response(text, {
    status: 200,
    headers: {
      ...corsHeaders(origin, allowed),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
};

// ── Request validation ────────────────────────────────────────
// Returns { body } to send upstream, or { error } to reject with.
function buildRequest(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Body must be a JSON object" };
  }

  const messages = parsed.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "messages must be a non-empty array" };
  }
  if (messages.length > MAX_MESSAGES) {
    return { error: `Too many messages (max ${MAX_MESSAGES})` };
  }

  let textChars = 0;
  let imageCount = 0;
  let cacheBreakpoints = 0;
  const clean = [];

  // Prompt caching is the app's main cost lever, so cache_control has to survive
  // this rebuild — but only in the exact shape the API accepts, and only up to
  // the API's limit of four.
  const checkCacheControl = (cc) => {
    if (cc === undefined) return { ok: true, value: undefined };
    if (!cc || typeof cc !== "object" || cc.type !== "ephemeral") {
      return { ok: false, error: "cache_control must be { type: 'ephemeral' }" };
    }
    if (++cacheBreakpoints > MAX_CACHE_BREAKPOINTS) {
      return { ok: false, error: `Too many cache_control breakpoints (max ${MAX_CACHE_BREAKPOINTS})` };
    }
    const value = { type: "ephemeral" };
    if (cc.ttl === "5m" || cc.ttl === "1h") value.ttl = cc.ttl;
    return { ok: true, value };
  };

  for (const m of messages) {
    if (!m || typeof m !== "object" || (m.role !== "user" && m.role !== "assistant")) {
      return { error: "Each message needs a role of 'user' or 'assistant'" };
    }

    if (typeof m.content === "string") {
      textChars += m.content.length;
      clean.push({ role: m.role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content)) {
      return { error: "message.content must be a string or an array of blocks" };
    }

    const blocks = [];
    for (const b of m.content) {
      if (!b || typeof b !== "object") return { error: "Invalid content block" };

      const cc = checkCacheControl(b.cache_control);
      if (!cc.ok) return { error: cc.error };

      if (b.type === "text") {
        if (typeof b.text !== "string") return { error: "A text block needs a string 'text'" };
        textChars += b.text.length;
        const block = { type: "text", text: b.text };
        if (cc.value) block.cache_control = cc.value;
        blocks.push(block);
      } else if (b.type === "image") {
        const s = b.source;
        if (!s || s.type !== "base64" || typeof s.data !== "string" || typeof s.media_type !== "string") {
          return { error: "An image block must be base64 with media_type and data" };
        }
        if (!/^image\/(png|jpeg|gif|webp)$/.test(s.media_type)) {
          return { error: "Unsupported image type" };
        }
        if (s.data.length > MAX_IMAGE_CHARS) return { error: "Image too large" };
        if (++imageCount > MAX_IMAGES) return { error: `Too many images (max ${MAX_IMAGES})` };
        const block = { type: "image", source: { type: "base64", media_type: s.media_type, data: s.data } };
        if (cc.value) block.cache_control = cc.value;
        blocks.push(block);
      } else {
        return { error: `Unsupported content block type: ${String(b.type)}` };
      }
    }

    if (blocks.length === 0) return { error: "Empty message content" };
    clean.push({ role: m.role, content: blocks });
  }

  if (textChars > MAX_TEXT_CHARS) {
    return { error: `Conversation too long (${textChars} characters, max ${MAX_TEXT_CHARS})` };
  }

  // Everything else the caller sent — model, system, tools, stream, temperature
  // — is dropped on the floor. Only these four fields go upstream.
  const model = ALLOWED_MODELS.has(parsed.model) ? parsed.model : DEFAULT_MODEL;
  const maxTokens = Number.isInteger(parsed.max_tokens)
    ? Math.min(Math.max(parsed.max_tokens, 1), MAX_TOKENS_CAP)
    : MAX_TOKENS_CAP;

  return { body: { model, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages: clean } };
}

// ── Origin checks ─────────────────────────────────────────────
function isAllowedOrigin(origin, req) {
  if (!origin) return false;
  const o = origin.replace(/\/$/, "");

  // Same-origin: the page and the function are on the same host. Derived from
  // the request itself, so it keeps working on custom domains, branch deploys
  // and deploy previews without any env var being set correctly.
  const host = req.headers.get("host");
  if (host) {
    try {
      if (new URL(o).host === host) return true;
    } catch { return false; }
  }

  // Local development against the deployed function.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;

  // Explicit extras, comma-separated, e.g. "https://example.com,https://www.example.com"
  const extra = Netlify.env.get("ALLOWED_ORIGINS");
  if (extra) {
    for (const entry of extra.split(",")) {
      if (entry.trim().replace(/\/$/, "") === o) return true;
    }
  }
  return false;
}

// ── Rate limiting ─────────────────────────────────────────────
function clientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

// Returns 0 when allowed, otherwise the seconds to wait.
function rateLimit(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);

  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000));
  }

  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some(t => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return 0;
}

// ── Response helpers ──────────────────────────────────────────
function corsHeaders(origin, allowed) {
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  // Echo the caller's origin only when it passed the check — no wildcard.
  if (allowed && origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(obj, status, origin, allowed, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(origin, allowed),
      ...(extra || {}),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export const config = { path: "/api/claude" };

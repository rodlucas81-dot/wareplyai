// WA Reply AI service worker.
//
// Strategy, deliberately: the app is one self-contained HTML file, so the
// document is the thing that goes stale. Navigations are network-first, which
// means a deploy is picked up on the next online load; the cache only serves
// the document when the network fails. Static assets (icons, manifest) are
// stale-while-revalidate. API calls are never cached.
//
// Bump CACHE_VERSION when the precache list changes; old caches are deleted on
// activate, so a stale shell can never be pinned forever.

const CACHE_VERSION = 'v2';
const CACHE = `wareplyai-${CACHE_VERSION}`;

// Hand-off area for Android's share sheet. A shared chat export arrives here as
// a POST, which the page can't read directly — so we stash it and the page
// picks it up on the redirect. Deliberately a separate cache so it survives the
// version sweep in activate().
const SHARE_CACHE = 'wareplyai-share';
const SHARE_META = '/__share/meta';
const SHARE_FILE = '/__share/file';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Individual adds so one missing file can't fail the whole install.
      Promise.all(PRECACHE.map(url =>
        cache.add(new Request(url, { cache: 'reload' }))
          .catch(err => console.warn('[sw] precache skipped', url, err))
      ))
    )
  );
  // No skipWaiting() here on purpose: the new worker waits until the page
  // tells it to take over (see the SKIP_WAITING message below), so the user
  // isn't swapped mid-session without being asked.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(n => n.startsWith('wareplyai-') && n !== CACHE && n !== SHARE_CACHE)
        .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Stash the shared payload, then redirect to the app so it opens as a normal
// page load. 303 is what turns the POST back into a GET.
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);

    // WhatsApp sends the export as a file; other apps may share plain text.
    const text = ['title', 'text', 'url']
      .map(k => form.get(k))
      .filter(v => typeof v === 'string' && v.trim())
      .join('\n');

    const file = form.get('file');
    let fileMeta = null;
    if (file && typeof file !== 'string' && file.size > 0) {
      fileMeta = { name: file.name || 'shared.txt', type: file.type || '' };
      await cache.put(SHARE_FILE, new Response(file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' }
      }));
    } else {
      await cache.delete(SHARE_FILE);
    }

    await cache.put(SHARE_META, new Response(
      JSON.stringify({ text, file: fileMeta, at: Date.now() }),
      { headers: { 'Content-Type': 'application/json' } }
    ));
  } catch (err) {
    console.error('[sw] could not read shared payload', err);
  }
  return Response.redirect('/?share=1', 303);
}

function isCacheable(res) {
  // Only store our own successful, non-partial responses. Opaque cross-origin
  // and 206 responses are useless here and quietly poison a cache.
  return res && res.ok && res.status === 200 && res.type === 'basic';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  const reqUrl = new URL(req.url);

  // Android share sheet: "Export chat" POSTs the .txt here. Must be checked
  // before the GET-only bail-out below.
  if (req.method === 'POST' && reqUrl.pathname === '/share-target') {
    event.respondWith(receiveShare(req));
    return;
  }

  if (req.method !== 'GET') return;

  const url = reqUrl;
  if (url.origin !== self.location.origin) return;   // CDNs, Anthropic, etc.
  if (url.pathname.startsWith('/api/')) return;      // never cache generations

  // Documents: network-first, cache only as an offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (isCacheable(fresh)) {
          const cache = await caches.open(CACHE);
          cache.put('/index.html', fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req) || await caches.match('/index.html');
        if (cached) return cached;
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
          '<body style="background:#0a0f0d;color:#e0e0e0;font-family:sans-serif;padding:40px;text-align:center">' +
          '<h1>Offline</h1><p>WA Reply AI needs a connection the first time. Try again once you are back online.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then(res => {
        if (isCacheable(res)) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

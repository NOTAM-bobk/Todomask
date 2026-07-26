// Simple offline-capable service worker for a Vite SPA.
// Strategy:
//  - App shell (/, /index.html, /manifest.webmanifest, /task.png) is precached on install.
//  - Navigations: try network first, fall back to cached index.html when offline (so deep links still open).
//  - Everything else (JS/CSS/img chunks Vite generates): cache-first with a background
//    refresh, so assets get cached the first time they're fetched and work offline after that.

const CACHE_NAME = 'task-app-cache-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/task.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // Only handle same-origin requests; let cross-origin (APIs, CDNs) pass through normally.
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Page navigations: network first, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets: cache-first, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached || networkFetch
    })
  )
})

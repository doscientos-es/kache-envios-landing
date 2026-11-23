import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getViteConfig } from 'astro/config'

const require = createRequire(import.meta.resolve('astro/package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)

function until(condition) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval)
        resolve()
      } else if (++attempts >= 100) {
        clearInterval(interval)
        reject(new Error('Timed out waiting for route refresh'))
      }
    }, 10)
  })
}

test('routes load on visit, warn on network failures and recover after cache expiry', async () => {
  const config = await getViteConfig(
    {
      resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
      define: {
        'import.meta.env.PUBLIC_SUPABASE_URL': JSON.stringify('https://example.test'),
        'import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('test-public-key'),
      },
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: 'error',
    },
    { configFile: false, fonts: [] },
  )({ command: 'serve', mode: 'test' })
  config.plugins = config.plugins.flat(Infinity).filter((plugin) => plugin?.name !== 'astro:server')
  const server = await createServer(config)
  const originals = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  }
  const warn = console.warn
  const values = new Map()
  const listeners = new Map()
  const list = { innerHTML: '', dataset: {} }
  const notice = { innerHTML: '', dataset: {} }
  const warning = { hidden: true }
  const count = { hidden: true, textContent: '' }
  const localities = {
    children: [],
    replaceChildren(...children) {
      this.children = children
    },
  }
  const section = {
    dataset: { appearance: 'classic', limit: '3' },
    querySelector(selector) {
      return {
        '[data-routes-list]': list,
        '[data-routes-notice]': notice,
        '[data-routes-stale]': warning,
      }[selector]
    },
    removeAttribute() {},
    dispatchEvent() {},
  }
  const cacheKey = 'kache-landing:v1:routes'
  const cached = [
    {
      id: 'cached',
      serviceDate: '2099-01-01',
      endDate: '2099-01-01',
      reverse: false,
      name: 'Guardada',
      color: '#ffffff',
      base: 'Córdoba',
      stops: ['Madrid'],
      itinerary: ['Córdoba', 'Madrid'],
      points: [
        { name: 'Córdoba', lat: 37, lng: -4 },
        { name: 'Madrid', lat: 40, lng: -3 },
      ],
    },
  ]
  const rows = [
    {
      id: 'fresh',
      service_date: '2099-01-02',
      end_date: '2099-01-02',
      route_direction: 'normal',
      template_name: 'Actualizada',
      template_color: '#ffffff',
      localities: ['Córdoba', 'Sevilla'],
      stops: [
        { locality: 'Córdoba', latitude: 37, longitude: -4 },
        { locality: 'Sevilla', latitude: 38, longitude: -5 },
      ],
    },
  ]
  const saveCache = (data, age = 0) =>
    values.set(cacheKey, JSON.stringify({ savedAt: Date.now() - age, data }))
  let resolveFirst
  let nextResponse
  let calls = 0
  try {
    saveCache(cached)
    globalThis.window = {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      addEventListener: (type, handler) => listeners.set(type, handler),
    }
    globalThis.document = {
      readyState: 'complete',
      documentElement: { dataset: {} },
      querySelector: (selector) => (selector === '#route-localities' ? localities : null),
      querySelectorAll: (selector) =>
        selector === '[data-live-routes]'
          ? [section]
          : selector === '[data-route-count]'
            ? [count]
            : [],
      createElement: () => ({ value: '' }),
      addEventListener() {},
    }
    globalThis.fetch = () => {
      calls++
      if (calls === 1)
        return new Promise((resolve) => {
          resolveFirst = resolve
        })
      return Promise.resolve(nextResponse)
    }
    console.warn = () => {}
    await server.ssrLoadModule('/src/scripts/live-data.ts')
    assert.equal(calls, 1)
    assert.match(list.innerHTML, /Guardada/)
    assert.equal(count.textContent, '1')
    resolveFirst(new Response(JSON.stringify(rows), { status: 200 }))
    await until(() => list.innerHTML.includes('Actualizada'))
    assert.match(list.innerHTML, /solicitar-transporte\?ruta=fresh/)
    assert.match(list.innerHTML, /https:\/\/www\.google\.com\/maps\/dir\//)
    assert.deepEqual(
      localities.children.map((option) => option.value),
      ['Córdoba', 'Sevilla'],
    )

    const refresh = async (response, age) => {
      const entry = JSON.parse(values.get(cacheKey))
      saveCache(entry.data, age)
      nextResponse = response
      const previousCalls = calls
      listeners.get('focus')()
      await until(() => calls > previousCalls)
    }
    await refresh(new Response('', { status: 403 }), 60_000)
    await until(() => !warning.hidden)
    assert.match(list.innerHTML, /Actualizada/)
    await refresh(new Response(JSON.stringify(rows), { status: 200 }), 60_000)
    await until(() => warning.hidden)

    await refresh(new Response('', { status: 403 }), 25 * 60 * 60_000)
    await until(() => notice.innerHTML.includes('No hemos podido cargar las rutas'))
    assert.equal(list.innerHTML, '')
    assert.equal(count.hidden, true)
    assert.deepEqual(localities.children, [])
    await refresh(new Response('[]', { status: 200 }), 25 * 60 * 60_000)
    await until(() => notice.innerHTML.includes('Estamos preparando las próximas salidas'))
    await refresh(new Response('', { status: 403 }), 25 * 60 * 60_000)
    await until(() => notice.innerHTML.includes('No hemos podido cargar las rutas'))
    await refresh(new Response('[]', { status: 200 }), 25 * 60 * 60_000)
    await until(() => notice.innerHTML.includes('Estamos preparando las próximas salidas'))
  } finally {
    console.warn = warn
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
    await server.close()
  }
})

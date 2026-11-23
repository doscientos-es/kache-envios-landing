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
    const timer = setInterval(() => {
      if (condition()) {
        clearInterval(timer)
        resolve()
      } else if (++attempts >= 100) {
        clearInterval(timer)
        reject(new Error('Timed out waiting for price refresh'))
      }
    }, 10)
  })
}

function rows(price, size, largePrice = null) {
  return [
    {
      category: 'mediano',
      label: 'Box actualizado',
      amount_cents: price,
      large_amount_cents: largePrice,
      dimensions: size,
      next_box_from_kg: 13,
      sort_order: 2,
    },
  ]
}

test('prices refresh on visits and visible tabs, and warn on failures', async () => {
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
  const list = { innerHTML: '<li>tarifa de la compilación</li>', dataset: {} }
  const status = { hidden: false, textContent: 'Cargando tarifas actualizadas…' }
  const cached = [
    {
      category: 'mediano',
      label: 'Box guardado',
      amountCents: 10000,
      largeAmountCents: null,
      details: ['Medida guardada'],
      maxWeightKg: 13,
    },
  ]
  const cacheKey = 'kache-landing:v1:boxes'
  const saveCache = (data, age = 0) =>
    values.set(cacheKey, JSON.stringify({ savedAt: Date.now() - age, data }))
  let interval
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
      setInterval: (handler, delay) => {
        interval = handler
        assert.equal(delay, 60_000)
      },
    }
    globalThis.document = {
      readyState: 'complete',
      visibilityState: 'visible',
      documentElement: { dataset: { builtAt: String(Date.now() + 60_000) } },
      querySelector: (selector) => (selector === '[data-live-boxes]' ? list : null),
      querySelectorAll: (selector) =>
        selector === '[data-live-boxes]'
          ? [list]
          : selector === '[data-boxes-fallback]'
            ? [status]
            : [],
      addEventListener() {},
    }
    globalThis.fetch = (url, options) => {
      assert.match(url, /\/rest\/v1\/transport_box_catalog\?/)
      assert.equal(options.cache, 'no-store')
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
    assert.match(list.innerHTML, /Box guardado/)
    resolveFirst(new Response(JSON.stringify(rows(12000, 'Medida nueva', 18000)), { status: 200 }))
    await until(() => list.innerHTML.includes('Medida nueva') && status.hidden)
    assert.match(list.innerHTML, /120/)
    assert.match(list.innerHTML, /180/)

    document.visibilityState = 'hidden'
    interval()
    assert.equal(calls, 1)
    document.visibilityState = 'visible'
    nextResponse = new Response(JSON.stringify(rows(14500, 'Medida modificada', 20500)), {
      status: 200,
    })
    interval()
    await until(() => list.innerHTML.includes('Medida modificada'))
    assert.match(list.innerHTML, /145/)
    assert.match(list.innerHTML, /205/)

    nextResponse = new Response('', { status: 403 })
    interval()
    await until(() => !status.hidden && status.textContent.includes('información guardada'))
    assert.match(list.innerHTML, /145/)

    nextResponse = new Response('[]', { status: 200 })
    status.hidden = true
    interval()
    await until(() => !status.hidden)
    assert.match(list.innerHTML, /145/)
    assert.match(status.textContent, /información guardada/)

    const entry = JSON.parse(values.get(cacheKey))
    saveCache(entry.data, 25 * 60 * 60_000)
    nextResponse = new Response('', { status: 403 })
    listeners.get('focus')()
    await until(() => status.textContent.includes('No hemos podido cargar las tarifas'))
    assert.equal(list.innerHTML, '')

    nextResponse = new Response(JSON.stringify(rows(16000, 'Medida recuperada')), { status: 200 })
    listeners.get('focus')()
    await until(() => status.hidden && list.innerHTML.includes('Medida recuperada'))
    assert.match(list.innerHTML, /160/)
  } finally {
    console.warn = warn
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
    await server.close()
  }
})

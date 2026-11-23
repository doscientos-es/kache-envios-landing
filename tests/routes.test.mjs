import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getViteConfig } from 'astro/config'

// Use Astro's actual image/TypeScript pipeline, with Node's built-in test runner.
const require = createRequire(import.meta.resolve('astro/package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const config = await getViteConfig(
  {
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'error',
  },
  { configFile: false, fonts: [] },
)({ command: 'serve', mode: 'test' })
// Renderers need Astro's asset transforms, not its asynchronous HTTP app startup.
config.plugins = config.plugins.flat(Infinity).filter((plugin) => plugin?.name !== 'astro:server')
const server = await createServer(config)
after(() => server.close())

const { renderRouteCard, renderRouteList, renderRoutesNotice } =
  await server.ssrLoadModule('/src/lib/render.ts')
const { googleMapsRouteLinks, mapRoute, routePoints, upcomingRoutes } =
  await server.ssrLoadModule('/src/lib/routes.ts')
const { readCache, syncResource } = await server.ssrLoadModule('/src/lib/cache.ts')
const today = '2026-11-03'
const route = {
  id: 'route/one',
  serviceDate: '2026-11-04',
  endDate: '2026-11-06',
  reverse: false,
  name: 'Norte',
  color: '#d8040e',
  base: 'Córdoba',
  stops: ['Madrid', 'Burgos', 'Bilbao', 'Santander', 'Oviedo', 'Gijón', 'León'],
  points: [
    { name: 'Córdoba', lat: 37.88, lng: -4.78 },
    { name: 'Madrid', lat: 40.42, lng: -3.7 },
  ],
}

test('classic cards put the always-visible map first and hide stops behind a disclosure', () => {
  const html = renderRouteCard(route, { today, appearance: 'classic' })
  assert.match(html, /class="classic-route"/)
  assert.match(html, /Ruta 4, 5 y 6 de noviembre/)
  for (const stop of route.stops) assert.ok(html.includes(stop), `Missing stop: ${stop}`)
  assert.match(html, /solicitar-transporte\?ruta=route%2Fone/)
  assert.match(html, /<div class="route-map[^>]* data-route-map /)
  assert.ok(html.indexOf('data-route-map ') < html.indexOf('classic-route-title'))
  assert.ok(html.indexOf('data-route-map ') < html.indexOf('Abrir en Google Maps'))
  assert.doesNotMatch(
    html,
    /data-route-map-toggle|Ocultar mapa|classic-route-photo|classic-route-poster/,
  )
  assert.ok(!html.includes('Transporte de mascotas'))
  const beforeStops = html.split('<details class="route-stops-disclosure">')[0]
  assert.equal((beforeStops.match(/classic-route-stop-number/g) ?? []).length, 0)
  assert.match(html, /<details class="route-stops-disclosure"><summary>.*Ver paradas/)
  const beforeDetails = html.split('<details class="route-more-stops">')[0]
  assert.equal((beforeDetails.match(/classic-route-stop-number/g) ?? []).length, 5)
  assert.match(html, /<summary>Ver 3 paradas más<\/summary>/)
  assert.match(html, /start="6"/)
  const dialog = html.split('<template data-route-details>')[1]
  assert.match(dialog, /<dialog[^>]*aria-label="Detalles de la ruta Norte"/)
  assert.doesNotMatch(
    html.split('<template data-route-details>')[0],
    /no muestra el trazado por carretera/,
  )
  assert.match(dialog, /no muestra el trazado por carretera/)
  for (const stop of [route.base, ...route.stops]) assert.ok(dialog.includes(stop))
  assert.match(dialog, /solicitar-transporte\?ruta=route%2Fone/)
  assert.match(html, /https:\/\/www\.google\.com\/maps\/dir\//)
  assert.match(html, /href="https:\/\/wa\.me\//)
  assert.equal((html.match(/classic-route-stop-number/g) ?? []).length, 8)
})

test('public routes preserve repeated stops and only show a return when it exists', () => {
  const mapped = mapRoute({
    id: 'real-route',
    service_date: '2026-11-04',
    route_direction: 'normal',
    template_name: 'Norte',
    template_color: '#d8040e',
    localities: ['Córdoba', 'Madrid', 'Burgos', 'Madrid', 'Córdoba'],
    stops: [],
  })
  assert.deepEqual(mapped.itinerary, ['Córdoba', 'Madrid', 'Burgos', 'Madrid', 'Córdoba'])
  const html = renderRouteCard(mapped, { today, appearance: 'classic' })
  assert.equal((html.match(/classic-route-stop-number/g) ?? []).length, 5)
  assert.match(html, /Salida y regreso: Córdoba/)
  const oneWay = renderRouteCard({ ...mapped, itinerary: ['Córdoba', 'Madrid'] }, { today })
  assert.match(oneWay, /Salida: Córdoba/)
  assert.ok(!oneWay.includes('Salida y regreso'))
  const missing = renderRouteCard({ ...mapped, base: '', itinerary: [], stops: [] }, { today })
  assert.match(missing, /Punto de salida pendiente de confirmar/)
  assert.ok(!missing.includes('Córdoba'))
})

test('a map is not offered when any itinerary stop has no coordinates', () => {
  const incomplete = { ...route, itinerary: ['Córdoba', 'Madrid', 'Burgos'] }
  assert.deepEqual(routePoints(incomplete), [])
  assert.ok(
    !renderRouteCard(incomplete, { today, appearance: 'classic' }).includes('data-route-map '),
  )
  const unavailable = renderRouteCard(incomplete, { today, appearance: 'classic' })
  assert.match(unavailable, /Mapa no disponible para esta ruta/)
  assert.doesNotMatch(unavailable, /Abrir en Google Maps|no muestra el trazado por carretera/)
  const complete = { ...route, itinerary: ['Córdoba', 'Madrid'] }
  assert.equal(routePoints(complete).length, 2)
  assert.match(renderRouteCard(complete, { today }), /no muestra el trazado por carretera/)
})

test('Google Maps links cover long routes in order with at most three mobile waypoints', () => {
  const points = Array.from({ length: 50 }, (_, index) => ({
    name: `Parada ${index + 1}`,
    lat: index,
    lng: -index,
  }))
  const links = googleMapsRouteLinks(points)
  assert.equal(links.length, 13)
  const visited = []
  for (const [index, link] of links.entries()) {
    const params = new URL(link.url).searchParams
    const waypoints = (params.get('waypoints') ?? '').split('|').filter(Boolean)
    assert.ok(waypoints.length <= 3)
    const leg = [params.get('origin'), ...waypoints, params.get('destination')]
    if (index) assert.equal(leg[0], visited.at(-1))
    visited.push(...leg.slice(index ? 1 : 0))
  }
  assert.deepEqual(
    visited,
    points.map((point) => `${point.lat},${point.lng}`),
  )
  assert.equal(links.at(-1).to, 'Parada 50')
})

test('route cache is shown immediately and refreshed on each visit, including concurrent calls', async () => {
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  }
  try {
    let loads = 0
    let finish
    const resource = {
      key: 'routes-test',
      freshMs: 300_000,
      maxAgeMs: 86_400_000,
      load: () => {
        loads += 1
        return new Promise((resolve) => {
          finish = resolve
        })
      },
    }
    values.set(
      'kache-landing:v1:routes-test',
      JSON.stringify({ savedAt: Date.now(), data: ['cached'] }),
    )
    const applied = []
    const options = {
      freshMs: Infinity,
      force: true,
      apply: (data) => applied.push(data),
      onError: () => assert.fail(),
    }
    const first = syncResource(resource, options)
    const second = syncResource(resource, options)
    assert.deepEqual(applied, [['cached'], ['cached']])
    assert.equal(loads, 1)
    finish(['updated'])
    await Promise.all([first, second])
    assert.deepEqual(applied, [['cached'], ['cached'], ['updated'], ['updated']])
    assert.deepEqual(readCache(resource).data, ['updated'])
    await syncResource(resource, { ...options, force: false })
    assert.equal(loads, 1)
  } finally {
    delete globalThis.window
  }
})

test('cache failures retain recent data and reject expired data', async () => {
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  }
  try {
    const resource = {
      key: 'failure-test',
      freshMs: 0,
      maxAgeMs: 1000,
      load: async () => {
        throw new Error('offline')
      },
    }
    const seen = []
    const errors = []
    const options = {
      freshMs: 0,
      apply: (data) => seen.push(data),
      onError: (_, hasCache) => errors.push(hasCache),
    }
    values.set(
      'kache-landing:v1:failure-test',
      JSON.stringify({ savedAt: Date.now(), data: ['saved'] }),
    )
    await syncResource(resource, options)
    assert.deepEqual(seen, [['saved']])
    assert.deepEqual(errors, [true])
    values.set(
      'kache-landing:v1:failure-test',
      JSON.stringify({ savedAt: Date.now() - 2000, data: ['expired'] }),
    )
    await syncResource(resource, options)
    assert.deepEqual(seen, [['saved']])
    assert.deepEqual(errors, [true, false])
  } finally {
    delete globalThis.window
  }
})

test('upcoming departures are ordered by date without mutating the original list', () => {
  const late = { ...route, id: 'late', serviceDate: '2026-12-01' }
  const expired = { ...route, id: 'expired', serviceDate: '2026-10-01' }
  const routes = [late, expired, route]
  assert.deepEqual(
    upcomingRoutes(routes, today).map((item) => item.id),
    ['route/one', 'late'],
  )
  assert.deepEqual(
    routes.map((item) => item.id),
    ['late', 'expired', 'route/one'],
  )
})

test('classic rendering escapes names, stops and attributes from public data', () => {
  const html = renderRouteCard(
    {
      ...route,
      name: '<script>alert("name")</script>',
      base: '"><img src=x onerror=alert(1)>',
      stops: ['<svg onload=alert(1)>'],
    },
    { today, appearance: 'classic' },
  )
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<svg onload='))
  assert.ok(!html.includes('<img src=x'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&lt;svg onload='))
})

test('default and compact cards hide all stops and limit the initial expanded list', () => {
  const html = renderRouteCard(route, { today, compact: true })
  assert.match(html, /data-route-card data-search=/)
  assert.ok(!html.includes('classic-route'))
  assert.ok(html.indexOf('data-route-map ') < html.indexOf('<header'))
  assert.ok(html.indexOf('data-route-map ') < html.indexOf('Abrir en Google Maps'))
  assert.doesNotMatch(html, /data-route-map-toggle|Ocultar mapa/)
  assert.match(html, /<details class="route-more-stops"><summary>Ver 2 paradas más<\/summary>/)
  assert.match(html, /<details class="route-stops-disclosure"><summary>.*Ver paradas/)
  assert.ok(!html.split('<details class="route-stops-disclosure">')[0].includes('>Madrid</li>'))
  assert.ok(!html.split('<details class="route-more-stops">')[0].includes('>León</li>'))
  assert.match(html, /solicitar-transporte\?ruta=route%2Fone/)
  const short = renderRouteCard({ ...route, stops: route.stops.slice(0, 5) }, { today })
  assert.ok(!short.includes('route-more-stops'))
  assert.match(short, /<details class="route-stops-disclosure">/)
  const empty = renderRouteCard({ ...route, stops: [] }, { today })
  assert.ok(!empty.includes('route-stops-disclosure'))
  const oneMore = renderRouteCard({ ...route, stops: route.stops.slice(0, 6) }, { today })
  assert.match(oneMore, /Ver 1 parada más/)
})

test('classic lists exclude expired routes and retain their appearance when data changes', () => {
  const expired = { ...route, id: 'expired', serviceDate: '2026-10-01' }
  const next = {
    ...route,
    id: 'next',
    serviceDate: '2026-12-01',
    endDate: '2026-12-01',
    points: [],
  }
  const visible = upcomingRoutes([expired, route, next], today)
  const html = renderRouteList(visible, { today, appearance: 'classic' })
  assert.equal((html.match(/class="classic-route"/g) ?? []).length, 2)
  assert.ok(!html.includes('ruta=expired'))
  assert.match(html, /Ruta 1 de diciembre/)
  const refreshed = renderRouteCard(
    { ...next, name: 'Mediterráneo', stops: ['Valencia'] },
    { today, appearance: 'classic' },
  )
  assert.match(refreshed, /class="classic-route"/)
  assert.match(refreshed, /Mediterráneo/)
  assert.match(refreshed, /Valencia/)
  assert.ok(!refreshed.includes('data-route-map '))
})

test('missing routes show a contact option rather than invented departures', () => {
  assert.equal(renderRouteList([], { today, appearance: 'classic' }), '')
  for (const kind of ['empty', 'error']) {
    const html = renderRoutesNotice(kind)
    assert.match(html, /role="status"/)
    assert.match(html, /https:\/\/wa\.me\//)
    assert.ok(!html.includes('data-route-card'))
  }
})

test('long routes keep Google Maps legs below the map', () => {
  const points = Array.from({ length: 10 }, (_, index) => ({
    name: `Parada ${index + 1}`,
    lat: index,
    lng: -index,
  }))
  const html = renderRouteCard({ ...route, points }, { today, appearance: 'classic' })
  assert.ok(html.indexOf('data-route-map ') < html.indexOf('Abrir en Google Maps'))
  assert.equal((html.match(/https:\/\/www\.google\.com\/maps\/dir\//g) ?? []).length, 3)
  assert.match(html, /Tramo 3/)
})

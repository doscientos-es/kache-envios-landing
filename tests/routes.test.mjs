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
    server: { middlewareMode: true },
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
const { mapRoute, routePoints, upcomingRoutes } = await server.ssrLoadModule('/src/lib/routes.ts')
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

test('classic cards use live dates, all stops, route-specific booking and working map controls', () => {
  const html = renderRouteCard(route, { today, appearance: 'classic' })
  assert.match(html, /class="classic-route"/)
  assert.match(html, /Ruta 4, 5 y 6 de noviembre/)
  for (const stop of route.stops) assert.ok(html.includes(stop), `Missing stop: ${stop}`)
  assert.match(html, /solicitar-transporte\?ruta=route%2Fone/)
  assert.match(html, /data-route-map-toggle aria-expanded="false"/)
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
    !renderRouteCard(incomplete, { today, appearance: 'classic' }).includes(
      'data-route-map-toggle',
    ),
  )
  const complete = { ...route, itinerary: ['Córdoba', 'Madrid'] }
  assert.equal(routePoints(complete).length, 2)
  assert.match(renderRouteCard(complete, { today }), /no muestra el trazado por carretera/)
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

test('default and compact route cards keep the existing listing contract', () => {
  const html = renderRouteCard(route, { today, compact: true })
  assert.match(html, /data-route-card data-search=/)
  assert.ok(!html.includes('classic-route'))
  assert.match(html, /\+1 más/)
  assert.ok(!html.includes('>León</li>'))
  assert.match(html, /solicitar-transporte\?ruta=route%2Fone/)
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
  assert.ok(!refreshed.includes('data-route-map-toggle'))
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

function photoSources(routes) {
  return [
    ...renderRouteList(routes, { today, appearance: 'classic' }).matchAll(
      /class="classic-route-photo" src="([^"]+)"/g,
    ),
  ].map((match) => match[1])
}

test('classic lists keep the original photo sequence when automatic route data changes', () => {
  const departures = Array.from({ length: 4 }, (_, index) => ({ ...route, id: `route-${index}` }))
  const photos = photoSources(departures)
  assert.equal(photos.length, 4)
  assert.equal(new Set(photos.slice(0, 3)).size, 3)
  assert.equal(photos[3], photos[0])
  for (const item of departures) {
    item.id = `updated-${item.id}`
    item.name = 'Nueva ruta'
  }
  assert.deepEqual(photoSources(departures), photos)
})

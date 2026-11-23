/**
 * Route maps are visible by default. Leaflet loads when a map enters the viewport.
 * Cards are re-rendered by `live-data.ts`, so controls use event delegation.
 */
import type { RoutePoint } from '@/lib/routes'

// Free OpenStreetMap tiles: no API key (CARTO's basemaps now show an "API KEY REQUIRED" watermark).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
const LINE_COLOR = '#dc5545'

type Leaflet = typeof import('leaflet')

let leafletPromise: Promise<Leaflet> | undefined

function loadLeaflet() {
  leafletPromise ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(
    ([module]) => module.default ?? module,
  )
  return leafletPromise
}

const escapeText = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

function parsePoints(panel: HTMLElement): RoutePoint[] {
  try {
    return JSON.parse(panel.dataset.points ?? '[]') as RoutePoint[]
  } catch {
    return []
  }
}

/** Groups visits to the same place (the base is both first and last stop) into one marker. */
function uniqueStops(points: RoutePoint[]) {
  const stops: { point: RoutePoint; visits: number[] }[] = []
  points.forEach((point, index) => {
    const known = stops.find((stop) => stop.point.lat === point.lat && stop.point.lng === point.lng)
    if (known) known.visits.push(index + 1)
    else stops.push({ point, visits: [index + 1] })
  })
  return stops
}

function drawRoute(L: Leaflet, panel: HTMLElement, points: RoutePoint[]) {
  const map = L.map(panel, { scrollWheelZoom: false, zoomControl: true, attributionControl: true })
  L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map)

  const latLngs = points.map((point): [number, number] => [point.lat, point.lng])
  // White casing under the coloured line keeps it readable on any map background.
  L.polyline(latLngs, { color: '#fff', weight: 9, opacity: 0.9, lineCap: 'round' }).addTo(map)
  L.polyline(latLngs, { color: LINE_COLOR, weight: 5, opacity: 0.95, lineCap: 'round' }).addTo(map)

  const stops = uniqueStops(points)
  for (const { point, visits } of stops) {
    const isBase = visits[0] === 1
    const icon = L.divIcon({
      className: 'route-marker-wrap',
      html: `<span class="route-marker${isBase ? ' route-marker--base' : ''}">${isBase ? '★' : visits[0]}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })
    const role = isBase
      ? visits.length > 1
        ? 'Salida y regreso'
        : 'Salida'
      : `Parada ${visits[0]}`
    L.marker([point.lat, point.lng], { icon, title: point.name, keyboard: false })
      .bindTooltip(escapeText(point.name), { direction: 'top', offset: [0, -14] })
      .bindPopup(`<strong>${escapeText(point.name)}</strong><br>${role}`)
      .addTo(map)
  }

  map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36] })
  return map
}

const maps = new Map<HTMLElement, ReturnType<typeof drawRoute> | null>()

async function initializeMap(panel: HTMLElement) {
  if (panel.hidden || panel.dataset.loading || maps.get(panel)) return
  panel.dataset.loading = 'true'
  panel.innerHTML =
    '<p class="grid h-full place-items-center text-sm text-muted">Cargando mapa…</p>'
  try {
    const L = await loadLeaflet()
    if (!panel.isConnected || panel.hidden) return
    panel.innerHTML = ''
    maps.set(panel, drawRoute(L, panel, parsePoints(panel)))
  } catch (error) {
    console.warn('[kache-landing] No se ha podido cargar el mapa:', error)
    leafletPromise = undefined
    panel.innerHTML =
      '<p class="grid h-full place-items-center px-6 text-center text-sm text-muted">No hemos podido cargar el mapa. Usa «Abrir en Google Maps».</p>'
  } finally {
    delete panel.dataset.loading
  }
}

const observer =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) void initializeMap(entry.target as HTMLElement)
          }
        },
        { rootMargin: '200px' },
      )

function registerMaps() {
  for (const [panel, map] of maps) {
    if (panel.isConnected) continue
    observer?.unobserve(panel)
    map?.remove()
    maps.delete(panel)
  }
  for (const panel of document.querySelectorAll<HTMLElement>('[data-route-map]')) {
    if (maps.has(panel)) continue
    maps.set(panel, null)
    if (observer) observer.observe(panel)
    else void initializeMap(panel)
  }
}

document.addEventListener('click', (event) => {
  const toggle = (event.target as Element | null)?.closest('[data-route-map-toggle]')
  const box = toggle?.closest<HTMLElement>('[data-route-map-box]')
  const panel = box?.querySelector<HTMLElement>('[data-route-map]')
  if (!box || !panel || !toggle) return
  panel.hidden = !panel.hidden
  toggle.setAttribute('aria-expanded', String(!panel.hidden))
  const label = box.querySelector<HTMLElement>('[data-route-map-label]')
  if (label) label.textContent = panel.hidden ? 'Ver mapa' : 'Ocultar mapa'
  if (!panel.hidden) {
    const map = maps.get(panel)
    if (map) map.invalidateSize()
    else void initializeMap(panel)
  }
})

document.addEventListener('routes:updated', registerMaps)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerMaps)
else registerMaps()

/**
 * Route maps: each route card has a hidden panel with its stops (`data-points`). Leaflet and its
 * styles are only downloaded the first time someone opens a map. Cards are re-rendered by
 * `live-data.ts`, so clicks are handled by delegation on the document.
 */
import type { RoutePoint } from '@/lib/routes'

const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
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
  L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18, subdomains: 'abcd' }).addTo(map)

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
    const role = isBase ? 'Salida y regreso' : `Parada ${visits[0]}`
    L.marker([point.lat, point.lng], { icon, title: point.name, keyboard: false })
      .bindTooltip(escapeText(point.name), { direction: 'top', offset: [0, -14] })
      .bindPopup(`<strong>${escapeText(point.name)}</strong><br>${role}`)
      .addTo(map)
  }

  map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36] })
  return map
}

async function openMap(box: HTMLElement) {
  const panel = box.querySelector<HTMLElement>('[data-route-map]')
  const toggle = box.querySelector<HTMLButtonElement>('[data-route-map-toggle]')
  const label = box.querySelector<HTMLElement>('[data-route-map-label]')
  if (!panel || !toggle) return

  const open = panel.hidden
  panel.hidden = !open
  toggle.setAttribute('aria-expanded', String(open))
  if (label) label.textContent = open ? 'Ocultar mapa' : 'Ver recorrido en el mapa'
  if (!open || panel.dataset.ready) return

  panel.dataset.ready = 'true'
  panel.innerHTML =
    '<p class="grid h-full place-items-center text-sm text-muted">Cargando mapa…</p>'
  try {
    const L = await loadLeaflet()
    panel.innerHTML = ''
    drawRoute(L, panel, parsePoints(panel))
  } catch (error) {
    console.warn('[kache-landing] No se ha podido cargar el mapa:', error)
    delete panel.dataset.ready
    panel.innerHTML =
      '<p class="grid h-full place-items-center px-6 text-center text-sm text-muted">No hemos podido cargar el mapa. Usa «Abrir en Google Maps».</p>'
  }
}

document.addEventListener('click', (event) => {
  const toggle = (event.target as Element | null)?.closest('[data-route-map-toggle]')
  const box = toggle?.closest<HTMLElement>('[data-route-map-box]')
  if (box) void openMap(box)
})

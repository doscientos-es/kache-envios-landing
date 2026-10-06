import { rpc } from './supabase'

export type PublicRoute = {
  id: string
  serviceDate: string
  reverse: boolean
  name: string
  color: string
  /** Departure/return base (first stop). */
  base: string
  /** Unique intermediate localities in travel order. */
  stops: string[]
  /** Every stop with known coordinates, in travel order (base included, repeated if the route returns). */
  points: RoutePoint[]
}

export type RoutePoint = { name: string; lat: number; lng: number }

type PublicRouteRow = {
  id: string
  service_date: string
  route_direction: string
  template_name: string
  template_color: string
  localities: string[] | null
  stops?: { locality: string; latitude: number | null; longitude: number | null }[] | null
}

function mapPoints(stops: PublicRouteRow['stops']): RoutePoint[] {
  return (stops ?? []).flatMap((stop) =>
    typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
      ? [{ name: stop.locality.trim(), lat: stop.latitude, lng: stop.longitude }]
      : [],
  )
}

const FALLBACK_COLOR = '#fde2dd'
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function mapRoute(row: PublicRouteRow): PublicRoute {
  const localities = (row.localities ?? []).map((name) => name.trim()).filter(Boolean)
  const base = localities[0] ?? ''
  const stops = [...new Set(localities)].filter((name) => name !== base)
  return {
    id: row.id,
    serviceDate: row.service_date,
    reverse: row.route_direction === 'inversa',
    name: row.template_name.trim() || 'Ruta programada',
    color: HEX_COLOR.test(row.template_color) ? row.template_color : FALLBACK_COLOR,
    base,
    stops,
    points: mapPoints(row.stops),
  }
}

/** Upcoming active routes, without exact meeting points (see `list_public_transport_routes`). */
export async function fetchPublicRoutes(): Promise<PublicRoute[]> {
  const rows = await rpc<PublicRouteRow[]>(
    'list_public_transport_routes',
    'select=id,service_date,route_direction,template_name,template_color,localities,stops',
  )
  return rows.map(mapRoute)
}

/** Build-time variant: the page still renders (and refreshes in the browser) if Supabase fails. */
export async function fetchPublicRoutesSafe(): Promise<PublicRoute[] | null> {
  try {
    return await fetchPublicRoutes()
  } catch (error) {
    console.warn('[kache-landing] No se han podido cargar las rutas:', error)
    return null
  }
}

/** A map needs at least two stops with coordinates. Older cached routes may lack `points`. */
export function routePoints(route: PublicRoute): RoutePoint[] {
  const points = route.points ?? []
  return points.length >= 2 ? points : []
}

/** Google Maps URLs allow origin + destination + 9 waypoints. */
const MAPS_MAX_POINTS_PER_LINK = 11

function mapsLegUrl(points: RoutePoint[]) {
  const coords = (point: RoutePoint) => `${point.lat},${point.lng}`
  const params = new URLSearchParams({
    api: '1',
    origin: coords(points[0]),
    destination: coords(points.at(-1)!),
    travelmode: 'driving',
  })
  const waypoints = points.slice(1, -1).map(coords)
  if (waypoints.length) params.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/dir/?${params}`
}

/**
 * Official Google Maps directions links covering every stop in order. Long routes are split into
 * consecutive legs (each leg starts where the previous one ended) because Maps caps the stops.
 */
export function googleMapsRouteLinks(points: RoutePoint[]) {
  // Consecutive duplicates (same coordinates) add nothing and confuse Maps.
  const clean = points.filter(
    (point, i) => i === 0 || point.lat !== points[i - 1].lat || point.lng !== points[i - 1].lng,
  )
  if (clean.length < 2) return []
  const legs: RoutePoint[][] = []
  for (let start = 0; start < clean.length - 1; start += MAPS_MAX_POINTS_PER_LINK - 1) {
    legs.push(clean.slice(start, start + MAPS_MAX_POINTS_PER_LINK))
  }
  return legs.map((leg, i) => ({
    label:
      legs.length === 1 ? 'Abrir en Google Maps' : `Google Maps · tramo ${i + 1}/${legs.length}`,
    url: mapsLegUrl(leg),
  }))
}

export function upcomingRoutes(routes: PublicRoute[], today: string) {
  return routes.filter((route) => route.serviceDate >= today)
}

export function routeLocalities(routes: PublicRoute[]) {
  return [...new Set(routes.flatMap((route) => [route.base, ...route.stops]))]
    .filter(Boolean)
    .toSorted((a, b) => a.localeCompare(b, 'es'))
}

export function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

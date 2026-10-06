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

/** Google Maps directions through every stop, in order (path format accepts many more stops than `waypoints=`). */
export function googleMapsRouteUrl(points: RoutePoint[]) {
  const path = points.map((point) => `${point.lat},${point.lng}`).join('/')
  return `https://www.google.com/maps/dir/${path}`
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

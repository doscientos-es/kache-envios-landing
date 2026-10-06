/**
 * HTML renderers shared by the static build and the in-browser refresh, so live data
 * always looks identical to the prerendered markup.
 */
import { appLinks, whatsappLink } from '@/config/site'

import { boxAudience, type BoxItem } from './catalog'
import { dateParts, daysBetween, escapeHtml, formatEuros, relativeDayLabel } from './format'
import { iconSvg } from './icons'
import { googleMapsRouteLinks, normalizeSearch, routePoints, type PublicRoute } from './routes'

const COMPACT_STOPS = 6

export type RouteCardOptions = { today: string; compact?: boolean }

/** Toggle + lazy Leaflet panel (see `scripts/route-maps.ts`) and a direct Google Maps link. */
function renderRouteMap(route: PublicRoute) {
  const points = routePoints(route)
  if (!points.length) return ''
  const label = escapeHtml(route.name)
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-2" data-route-map-box>
      <button type="button" class="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:underline" data-route-map-toggle aria-expanded="false" aria-label="Ver el recorrido de la ruta ${label} en el mapa">${iconSvg('route', 'size-4')}<span data-route-map-label>Ver recorrido en el mapa</span></button>
      ${googleMapsRouteLinks(points)
        .map(
          (link) =>
            `<a class="inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-ink hover:underline" href="${escapeHtml(link.url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(link.label)}: ruta ${label} (se abre en una pestaña nueva)">${iconSvg('mapPin', 'size-4')}${escapeHtml(link.label)}</a>`,
        )
        .join('\n      ')}
      <div class="route-map h-72 w-full overflow-hidden rounded-2xl bg-cream ring-1 ring-ink/10" hidden data-route-map data-points="${escapeHtml(JSON.stringify(points))}" role="region" aria-label="Mapa del recorrido de la ruta ${label}"></div>
    </div>`
}

export function renderRouteCard(route: PublicRoute, { today, compact = false }: RouteCardOptions) {
  const date = dateParts(route.serviceDate)
  const days = daysBetween(today, route.serviceDate)
  const visibleStops = compact ? route.stops.slice(0, COMPACT_STOPS) : route.stops
  const hiddenStops = route.stops.length - visibleStops.length
  const search = normalizeSearch([route.name, route.base, ...route.stops].join(' '))
  const message = `Hola, quiero información sobre la ruta ${route.name} del ${date.long}.`

  const stops = visibleStops.map((stop) => `<li class="chip">${escapeHtml(stop)}</li>`).join('')
  const more = hiddenStops > 0 ? `<li class="chip bg-cream">+${hiddenStops} más</li>` : ''

  return `<article class="card group relative flex h-full flex-col overflow-hidden" data-route-card data-search="${escapeHtml(search)}" style="--route:${route.color}">
  <div class="h-2 bg-(--route)" aria-hidden="true"></div>
  <div class="flex flex-1 flex-col gap-5 p-6">
    <header class="flex items-start gap-4">
      <div class="grid w-16 shrink-0 place-items-center rounded-2xl bg-(--route)/45 py-2 text-center ring-1 ring-ink/5">
        <span class="text-2xl leading-none font-extrabold tabular-nums">${date.day}</span>
        <span class="text-xs font-bold tracking-wide uppercase">${escapeHtml(date.month)}</span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold text-muted first-letter:uppercase">${escapeHtml(date.weekday)} · <span class="text-brand-700">${relativeDayLabel(days)}</span></p>
        <h3 class="mt-1 truncate text-xl font-extrabold tracking-tight">Ruta ${escapeHtml(route.name)}</h3>
        <p class="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">${iconSvg('mapPin', 'size-4 shrink-0 text-brand')}Salida y regreso: ${escapeHtml(route.base || 'Córdoba')}${route.reverse ? ' · sentido inverso' : ''}</p>
      </div>
    </header>
    <ol class="flex flex-wrap gap-1.5" aria-label="Paradas de la ruta">${stops}${more}</ol>
    ${renderRouteMap(route)}
    <footer class="mt-auto flex flex-wrap gap-2 pt-1">
      <a class="btn btn-primary flex-1" href="${escapeHtml(appLinks.requestTransport(route.id))}">Reservar plaza ${iconSvg('arrowRight', 'size-4')}</a>
      <a class="btn btn-outline" href="${escapeHtml(whatsappLink(message))}" target="_blank" rel="noopener" aria-label="Consultar la ruta ${escapeHtml(route.name)} por WhatsApp">${iconSvg('whatsapp', 'size-4')}<span class="sm:hidden lg:inline">Consultar</span></a>
    </footer>
  </div>
</article>`
}

export function renderRouteList(routes: PublicRoute[], options: RouteCardOptions) {
  return routes.map((route) => `<li>${renderRouteCard(route, options)}</li>`).join('')
}

export function renderRoutesNotice(kind: 'empty' | 'error') {
  const copy =
    kind === 'empty'
      ? {
          icon: iconSvg('calendar', 'size-6'),
          title: 'Estamos preparando las próximas salidas',
          text: 'Publicamos las rutas cada mes. Escríbenos y te avisamos en cuanto haya una que te encaje.',
        }
      : {
          icon: iconSvg('info', 'size-6'),
          title: 'No hemos podido cargar las rutas',
          text: 'Vuelve a intentarlo en unos segundos o contáctanos directamente.',
        }
  return `<div class="card flex flex-col items-center gap-3 px-6 py-12 text-center" role="status">
  <span class="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">${copy.icon}</span>
  <h3 class="text-lg font-extrabold">${copy.title}</h3>
  <p class="max-w-md text-sm text-ink-soft">${copy.text}</p>
  <a class="btn btn-outline mt-2" href="${escapeHtml(whatsappLink('Hola, quiero información sobre las próximas rutas.'))}" target="_blank" rel="noopener">${iconSvg('whatsapp', 'size-4')} Escríbenos por WhatsApp</a>
</div>`
}

function boxPrice(box: BoxItem) {
  const from = formatEuros(box.amountCents)
  if (!box.largeAmountCents || box.largeAmountCents === box.amountCents) return from
  return `${from} – ${formatEuros(box.largeAmountCents)}`
}

export function renderBoxCard(box: BoxItem, featured = false) {
  const audience = boxAudience[box.category] ?? ''
  const weight = box.maxWeightKg
    ? `<li class="flex gap-2">${iconSvg('check', 'size-4 mt-0.5 shrink-0 text-brand')}Hasta ${box.maxWeightKg.toLocaleString('es-ES')} kg aprox.</li>`
    : ''
  const details = box.details
    .map(
      (detail) =>
        `<li class="flex gap-2">${iconSvg('check', 'size-4 mt-0.5 shrink-0 text-brand')}${escapeHtml(detail)}</li>`,
    )
    .join('')
  return `<article class="card relative flex h-full flex-col gap-4 p-6 ${featured ? 'ring-2 ring-brand' : ''}" data-box="${escapeHtml(box.category)}">
  ${featured ? '<span class="absolute -top-3 left-6 rounded-full bg-ink px-3 py-1 text-[11px] font-bold tracking-wide text-white uppercase">El más solicitado</span>' : ''}
  <div>
    <h3 class="text-lg font-extrabold">${escapeHtml(box.label)}</h3>
    ${audience ? `<p class="mt-1 text-sm text-muted">${escapeHtml(audience)}</p>` : ''}
  </div>
  <p class="text-4xl font-extrabold tracking-tight tabular-nums">${boxPrice(box)}</p>
  <ul class="grid gap-2 text-sm text-ink-soft">${details}${weight}</ul>
</article>`
}

export function renderBoxList(boxes: BoxItem[]) {
  return boxes.map((box) => `<li>${renderBoxCard(box, box.category === 'mediano')}</li>`).join('')
}

/**
 * Loads routes and prices on each page visit, displaying cached data while revalidating.
 */
import { syncResource, type Resource } from '@/lib/cache'
import { fetchBoxCatalog, type BoxItem } from '@/lib/catalog'
import { signature, todayInSpain } from '@/lib/format'
import { renderBoxList, renderRouteList, renderRoutesNotice } from '@/lib/render'
import {
  fetchPublicRoutes,
  normalizeSearch,
  routeLocalities,
  upcomingRoutes,
  type PublicRoute,
} from '@/lib/routes'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const routesResource: Resource<PublicRoute[]> = {
  key: 'routes',
  freshMs: 5 * MINUTE,
  maxAgeMs: 24 * HOUR,
  load: fetchPublicRoutes,
}

const boxesResource: Resource<BoxItem[]> = {
  key: 'boxes',
  freshMs: MINUTE,
  maxAgeMs: 24 * HOUR,
  load: fetchBoxCatalog,
}

/** On focus, data older than this is revalidated even within its fresh window. */
const FOCUS_FRESH_MS = 30_000

/** Cache entries older than this page's build are ignored in favour of the prerendered HTML. */
const builtAt = Number(document.documentElement.dataset.builtAt) || 0

function sync<T>(
  resource: Resource<T>,
  freshMs: number,
  apply: (data: T) => void,
  onError: (hasCache: boolean) => void,
  options: { force?: boolean; notBefore?: number; onRevalidated?: () => void } = {},
) {
  return syncResource(resource, {
    freshMs,
    notBefore: options.notBefore ?? builtAt,
    force: options.force,
    apply,
    onRevalidated: options.onRevalidated,
    onError: (error, hasCache) => {
      console.warn(`[kache-landing] Datos no actualizados (${resource.key}):`, error)
      onError(hasCache)
    },
  })
}

/** Replaces the markup only when it changed, avoiding flicker and lost scroll/focus. */
function replaceHtml(element: HTMLElement, html: string) {
  const next = signature(html)
  if (element.dataset.signature === next) return false
  element.innerHTML = html
  element.dataset.signature = next
  return true
}

function setText(selector: string, value: string) {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    element.textContent = value
    element.hidden = false
  }
}

function setRouteLocalities(routes: PublicRoute[]) {
  const localities = document.querySelector<HTMLDataListElement>('#route-localities')
  if (!localities) return
  localities.replaceChildren(
    ...routeLocalities(routes).map((name) => {
      const option = document.createElement('option')
      option.value = name
      return option
    }),
  )
}

function renderRoutesSection(section: HTMLElement, routes: PublicRoute[] | null) {
  const list = section.querySelector<HTMLElement>('[data-routes-list]')
  const notice = section.querySelector<HTMLElement>('[data-routes-notice]')
  if (!list || !notice) return

  if (!routes) {
    const changed = replaceHtml(list, '')
    replaceHtml(notice, renderRoutesNotice('error'))
    section.removeAttribute('aria-busy')
    if (changed) section.dispatchEvent(new CustomEvent('routes:updated', { bubbles: true }))
    return
  }

  const limit = Number(section.dataset.limit) || undefined
  const visible = routes.slice(0, limit)
  const changed = replaceHtml(
    list,
    renderRouteList(visible, {
      today: todayInSpain(),
      compact: section.dataset.compact === 'true',
      appearance: section.dataset.appearance === 'classic' ? 'classic' : 'default',
    }),
  )
  replaceHtml(notice, visible.length ? '' : renderRoutesNotice('empty'))
  section.removeAttribute('aria-busy')
  if (changed) section.dispatchEvent(new CustomEvent('routes:updated', { bubbles: true }))
}

function refreshRoutes(freshMs: number, force = false) {
  const sections = [...document.querySelectorAll<HTMLElement>('[data-live-routes]')]
  if (!sections.length && !document.querySelector('[data-route-count]')) return Promise.resolve()

  return sync(
    routesResource,
    freshMs,
    (all) => {
      const routes = upcomingRoutes(all, todayInSpain())
      for (const section of sections) renderRoutesSection(section, routes)
      setText('[data-route-count]', String(routes.length))
      setRouteLocalities(routes)
    },
    (hasCache) => {
      for (const section of sections) {
        if (!hasCache) renderRoutesSection(section, null)
        const warning = section.querySelector<HTMLElement>('[data-routes-stale]')
        if (warning) warning.hidden = !hasCache
      }
      if (!hasCache) {
        setRouteLocalities([])
        for (const count of document.querySelectorAll<HTMLElement>('[data-route-count]'))
          count.hidden = true
      }
    },
    {
      force,
      notBefore: 0,
      onRevalidated: () => {
        for (const section of sections) {
          const warning = section.querySelector<HTMLElement>('[data-routes-stale]')
          if (warning) warning.hidden = true
        }
      },
    },
  )
}

function refreshBoxes(freshMs: number, force = false) {
  const lists = [...document.querySelectorAll<HTMLElement>('[data-live-boxes]')]
  if (!lists.length) return Promise.resolve()
  let hasBoxes = false

  return sync(
    boxesResource,
    freshMs,
    (boxes) => {
      const html = renderBoxList(boxes)
      hasBoxes = html.length > 0
      for (const list of lists) replaceHtml(list, html)
    },
    (hasCache) => {
      const hasCachedBoxes = hasCache && hasBoxes
      if (!hasCachedBoxes) for (const list of lists) replaceHtml(list, '')
      for (const fallback of document.querySelectorAll<HTMLElement>('[data-boxes-fallback]')) {
        fallback.hidden = false
        fallback.textContent = hasCachedBoxes
          ? 'No hemos podido actualizar las tarifas. Mostramos información guardada; confirma los precios antes de reservar.'
          : 'No hemos podido cargar las tarifas. Escríbenos por WhatsApp y te informamos.'
      }
    },
    {
      force,
      notBefore: 0,
      onRevalidated: () => {
        for (const fallback of document.querySelectorAll<HTMLElement>('[data-boxes-fallback]'))
          fallback.hidden = true
      },
    },
  )
}

function syncAll(freshMs = Infinity, force = false) {
  void refreshRoutes(freshMs, force)
  void refreshBoxes(freshMs, force)
}

/** Client-side locality search for the routes page (`?q=` is kept in the URL). */
function setupRouteSearch() {
  const input = document.querySelector<HTMLInputElement>('[data-route-search]')
  const scope = document.querySelector<HTMLElement>('[data-live-routes]')
  if (!input || !scope) return
  const empty = document.querySelector<HTMLElement>('[data-search-empty]')
  const status = document.querySelector<HTMLElement>('[data-search-status]')

  const apply = () => {
    const query = normalizeSearch(input.value)
    const cards = [...scope.querySelectorAll<HTMLElement>('[data-route-card]')]
    let matches = 0
    for (const card of cards) {
      const match = !query || (card.dataset.search ?? '').includes(query)
      card.parentElement?.toggleAttribute('hidden', !match)
      if (match) matches += 1
    }
    const noResults = Boolean(query) && cards.length > 0 && matches === 0
    empty?.toggleAttribute('hidden', !noResults)
    if (status)
      status.textContent = query
        ? `${matches} ${matches === 1 ? 'ruta pasa' : 'rutas pasan'} por «${input.value.trim()}»`
        : ''

    const url = new URL(window.location.href)
    if (query) url.searchParams.set('q', input.value.trim())
    else url.searchParams.delete('q')
    window.history.replaceState(null, '', url)
  }

  input.value = new URL(window.location.href).searchParams.get('q') ?? input.value
  input.addEventListener('input', apply)
  scope.addEventListener('routes:updated', apply)
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-search-value]')) {
    button.addEventListener('click', () => {
      input.value = button.dataset.searchValue ?? ''
      apply()
      input.focus()
    })
  }
  apply()
}

function init() {
  setupRouteSearch()
  syncAll(Infinity, true)
  const onFocus = () => syncAll(FOCUS_FRESH_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onFocus()
  })
  window.addEventListener('focus', onFocus)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) onFocus()
  })
  if (document.querySelector('[data-live-boxes]')) {
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshBoxes(0)
    }, MINUTE)
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()

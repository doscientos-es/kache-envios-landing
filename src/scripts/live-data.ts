/**
 * Keeps prerendered routes and prices in sync with the internal app, without real time:
 * the static HTML shows first, newer cached data replaces it, and Supabase is only queried
 * when that data is missing or stale. Coming back to the tab revalidates stale data.
 */
import { isFresh, readCache, revalidate, type Resource } from '@/lib/cache'
import { fetchBoxCatalog, type BoxItem } from '@/lib/catalog'
import { signature, todayInSpain } from '@/lib/format'
import { renderBoxList, renderRouteList, renderRoutesNotice } from '@/lib/render'
import { fetchPublicRoutes, normalizeSearch, upcomingRoutes, type PublicRoute } from '@/lib/routes'
import { isSupabaseConfigured } from '@/lib/supabase'

const MINUTE = 60_000
const WEEK = 7 * 24 * 60 * MINUTE

const routesResource: Resource<PublicRoute[]> = {
  key: 'routes',
  freshMs: 5 * MINUTE,
  maxAgeMs: WEEK,
  load: fetchPublicRoutes,
}

const boxesResource: Resource<BoxItem[]> = {
  key: 'boxes',
  freshMs: 30 * MINUTE,
  maxAgeMs: WEEK,
  load: fetchBoxCatalog,
}

/** On focus, data older than this is revalidated even within its fresh window. */
const FOCUS_FRESH_MS = 30_000

/** Cache entries older than this page's build are ignored in favour of the prerendered HTML. */
const builtAt = Number(document.documentElement.dataset.builtAt) || 0

async function sync<T>(
  resource: Resource<T>,
  freshMs: number,
  apply: (data: T) => void,
  onError: () => void,
) {
  const cached = readCache(resource, builtAt)
  if (cached) apply(cached.data)
  if (cached && isFresh(cached, Math.min(freshMs, resource.freshMs))) return
  try {
    apply(await revalidate(resource))
  } catch (error) {
    console.warn(`[kache-landing] Datos no actualizados (${resource.key}):`, error)
    if (!cached) onError()
  }
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

function renderRoutesSection(section: HTMLElement, routes: PublicRoute[] | null) {
  const list = section.querySelector<HTMLElement>('[data-routes-list]')
  const notice = section.querySelector<HTMLElement>('[data-routes-notice]')
  if (!list || !notice) return

  if (!routes) {
    if (list.childElementCount === 0) notice.innerHTML = renderRoutesNotice('error')
    section.removeAttribute('aria-busy')
    return
  }

  const limit = Number(section.dataset.limit) || undefined
  const visible = routes.slice(0, limit)
  const changed = replaceHtml(
    list,
    renderRouteList(visible, {
      today: todayInSpain(),
      compact: section.dataset.compact === 'true',
    }),
  )
  replaceHtml(notice, visible.length ? '' : renderRoutesNotice('empty'))
  section.removeAttribute('aria-busy')
  if (changed) section.dispatchEvent(new CustomEvent('routes:updated', { bubbles: true }))
}

function refreshRoutes(freshMs: number) {
  const sections = [...document.querySelectorAll<HTMLElement>('[data-live-routes]')]
  if (!sections.length && !document.querySelector('[data-route-count]')) return Promise.resolve()

  return sync(
    routesResource,
    freshMs,
    (all) => {
      const routes = upcomingRoutes(all, todayInSpain())
      for (const section of sections) renderRoutesSection(section, routes)
      setText('[data-route-count]', String(routes.length))
    },
    () => {
      for (const section of sections) renderRoutesSection(section, null)
    },
  )
}

function refreshBoxes(freshMs: number) {
  const lists = [...document.querySelectorAll<HTMLElement>('[data-live-boxes]')]
  if (!lists.length) return Promise.resolve()

  return sync(
    boxesResource,
    freshMs,
    (boxes) => {
      if (!boxes.length) return
      for (const list of lists) replaceHtml(list, renderBoxList(boxes))
      for (const fallback of document.querySelectorAll('[data-boxes-fallback]')) fallback.remove()
    },
    () => {
      for (const fallback of document.querySelectorAll('[data-boxes-fallback]'))
        fallback.textContent =
          'No hemos podido cargar las tarifas. Escríbenos por WhatsApp y te informamos.'
    },
  )
}

function syncAll(freshMs = Infinity) {
  void refreshRoutes(freshMs)
  void refreshBoxes(freshMs)
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
  if (!isSupabaseConfigured) return
  syncAll()
  const onFocus = () => syncAll(FOCUS_FRESH_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onFocus()
  })
  window.addEventListener('focus', onFocus)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) onFocus()
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()

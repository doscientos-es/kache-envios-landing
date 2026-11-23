import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getViteConfig } from 'astro/config'

const require = createRequire(import.meta.resolve('astro/package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)

function layer() {
  return {
    addTo() {
      return this
    },
    bindTooltip() {
      return this
    },
    bindPopup() {
      return this
    },
  }
}

function untilLoaded(panel) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const interval = setInterval(() => {
      if (!panel.dataset.loading || ++attempts >= 100) {
        clearInterval(interval)
        if (panel.dataset.loading) reject(new Error('Timed out waiting for map'))
        else resolve()
      }
    }, 10)
  })
}

test('delegated card and map interactions survive route updates', async () => {
  const config = await getViteConfig(
    {
      resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      ssr: { noExternal: ['leaflet'] },
      logLevel: 'error',
    },
    { configFile: false, fonts: [] },
  )({ command: 'serve', mode: 'test' })
  config.plugins = config.plugins.flat(Infinity).filter((plugin) => plugin?.name !== 'astro:server')
  config.plugins.unshift({
    name: 'test-leaflet',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'leaflet') return '\0test-leaflet'
      if (id === 'leaflet/dist/leaflet.css') return '\0test-leaflet-css'
    },
    load(id) {
      if (id === '\0test-leaflet') return 'export default globalThis.testLeaflet'
      if (id === '\0test-leaflet-css') return 'export default {}'
    },
  })
  const server = await createServer(config)
  const originals = Object.fromEntries(
    ['document', 'window', 'Element', 'IntersectionObserver', 'testLeaflet'].map((key) => [
      key,
      globalThis[key],
    ]),
  )
  const listeners = new Map()
  let panels = []
  let reducedMotion = false
  let observer
  let currentDialog
  class FakeElement {
    constructor(matches = {}) {
      this.matches = matches
    }
    closest(selector) {
      return this.matches[selector] ?? null
    }
  }
  const fire = (type, target) => {
    for (const handler of listeners.get(type) ?? []) handler({ target })
  }
  const map = {
    removed: false,
    fitBounds() {},
    remove() {
      this.removed = true
    },
  }
  const button = {
    isConnected: true,
    focusCount: 0,
    closest(selector) {
      return selector === '[data-route-card]' ? card : null
    },
    focus() {
      this.focusCount++
    },
  }
  const dialogTemplate = {
    cloneNode() {
      return {
        dataset: {},
        showModal() {
          this.open = true
        },
        addEventListener(type, listener) {
          this.handlers ??= {}
          this.handlers[type] = listener
        },
        removeEventListener(type, listener) {
          if (this.handlers[type] === listener) delete this.handlers[type]
        },
        getBoundingClientRect() {
          return { left: 100, right: 300, top: 100, bottom: 300 }
        },
        close() {
          this.open = false
          this.handlers.close()
        },
        remove() {
          this.removed = true
        },
      }
    },
  }
  const card = {
    querySelector(selector) {
      if (selector === '[data-route-details-open]') return button
      if (selector === 'template[data-route-details]')
        return { content: { firstElementChild: dialogTemplate } }
    },
  }
  try {
    globalThis.Element = FakeElement
    globalThis.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback
        this.observed = new Set()
        observer = this
      }
      observe(panel) {
        this.observed.add(panel)
      }
      unobserve(panel) {
        this.observed.delete(panel)
      }
    }
    globalThis.window = {
      matchMedia: () => ({ matches: reducedMotion }),
      setTimeout,
      clearTimeout,
    }
    globalThis.document = {
      readyState: 'complete',
      addEventListener(type, listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener])
      },
      querySelectorAll: () => panels,
      body: {
        append(dialog) {
          currentDialog = dialog
        },
      },
    }
    globalThis.testLeaflet = {
      map: () => map,
      tileLayer: layer,
      polyline: layer,
      marker: layer,
      divIcon: () => ({}),
      latLngBounds: (points) => points,
    }
    const panel = {
      dataset: { points: '[{"name":"A","lat":1,"lng":2}]' },
      hidden: false,
      isConnected: true,
      innerHTML: '',
    }
    panels = [panel]
    await server.ssrLoadModule('/src/scripts/route-maps.ts')
    await server.ssrLoadModule('/src/scripts/route-cards.ts')
    assert.ok(observer.observed.has(panel))
    observer.callback([{ target: panel, isIntersecting: true }])
    await untilLoaded(panel)
    assert.equal(panel.dataset.loading, undefined)
    assert.equal(panel.innerHTML, '')

    const mapClick = new FakeElement({
      '[data-route-card]': card,
      'a, button, summary, details, input, select, textarea, [data-route-map]': panel,
    })
    fire('click', mapClick)
    assert.equal(panel.hidden, false)
    assert.equal(currentDialog, undefined)

    const interactive = new FakeElement({
      '[data-route-card]': card,
      'a, button, summary, details, input, select, textarea, [data-route-map]': {},
    })
    fire('click', interactive)
    assert.equal(currentDialog, undefined)
    const cardClick = new FakeElement({ '[data-route-card]': card })
    fire('click', cardClick)
    assert.equal(currentDialog, undefined)
    const openButton = new FakeElement({
      '[data-route-details-open]': button,
    })
    fire('click', openButton)
    assert.equal(currentDialog.open, true)
    const close = new FakeElement({ '[data-route-dialog-close]': {} })
    currentDialog.handlers.click({ target: close })
    assert.equal(currentDialog.dataset.closing, 'true')
    assert.equal(currentDialog.open, true)
    currentDialog.handlers.animationend({ target: currentDialog, animationName: 'route-dialog-in' })
    assert.equal(currentDialog.open, true)
    currentDialog.handlers.animationend({
      target: currentDialog,
      animationName: 'route-dialog-out',
    })
    assert.equal(currentDialog.removed, true)
    assert.equal(button.focusCount, 1)

    fire('click', openButton)
    assert.equal(currentDialog.open, true)
    const pointer = (type, x, y, target = currentDialog) => {
      currentDialog.handlers[type]({ target, clientX: x, clientY: y, button: 0 })
    }
    pointer('pointerdown', 150, 150)
    pointer('click', 150, 150)
    assert.equal(currentDialog.open, true)
    pointer('pointerdown', 150, 150)
    pointer('click', 50, 50)
    assert.equal(currentDialog.open, true)
    pointer('pointerdown', 50, 50)
    pointer('click', 150, 150)
    assert.equal(currentDialog.open, true)
    pointer('pointerdown', 50, 50)
    pointer('click', 50, 50)
    assert.equal(currentDialog.dataset.closing, 'true')
    currentDialog.handlers.animationend({
      target: currentDialog,
      animationName: 'route-dialog-out',
    })
    assert.equal(currentDialog.removed, true)
    assert.equal(button.focusCount, 2)
    fire('click', openButton)
    assert.equal(currentDialog.open, true)
    let prevented = false
    currentDialog.handlers.cancel({
      preventDefault: () => {
        prevented = true
      },
    })
    assert.equal(prevented, true)
    assert.equal(currentDialog.dataset.closing, 'true')
    currentDialog.handlers.animationend({
      target: currentDialog,
      animationName: 'route-dialog-out',
    })
    assert.equal(currentDialog.removed, true)

    reducedMotion = true
    fire('click', openButton)
    currentDialog.handlers.click({ target: close })
    assert.equal(currentDialog.removed, true)

    reducedMotion = false
    fire('click', openButton)
    currentDialog.handlers.click({ target: close })
    await new Promise((resolve) => setTimeout(resolve, 350))
    assert.equal(currentDialog.removed, true)

    panel.isConnected = false
    const replacement = { dataset: {}, hidden: false, isConnected: true }
    panels = [replacement]
    fire('routes:updated')
    assert.equal(map.removed, true)
    assert.ok(!observer.observed.has(panel))
    assert.ok(observer.observed.has(replacement))
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
    await server.close()
  }
})

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getViteConfig } from 'astro/config'

const require = createRequire(import.meta.resolve('astro/package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)

async function loadSite(publicAppUrl) {
  const config = await getViteConfig(
    {
      resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
      define: { 'import.meta.env.PUBLIC_APP_URL': JSON.stringify(publicAppUrl) },
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: 'error',
    },
    { configFile: false, fonts: [] },
  )({ command: 'serve', mode: 'test' })
  config.plugins = config.plugins.flat(Infinity).filter((plugin) => plugin?.name !== 'astro:server')
  const server = await createServer(config)
  try {
    return await server.ssrLoadModule('/src/config/site.ts')
  } finally {
    await server.close()
  }
}

for (const [configuredUrl, expectedUrl] of [
  ['', 'https://app.kacheenvios.com'],
  ['https://preview.example.test///', 'https://preview.example.test'],
]) {
  test(`application links use ${configuredUrl || 'the default URL'}`, async () => {
    const { appLinks, navigation } = await loadSite(configuredUrl)
    assert.equal(appLinks.clientPortal, `${expectedUrl}/`)
    assert.equal(navigation.find((item) => item.label === 'Mi espacio')?.href, appLinks.clientPortal)
    assert.equal(appLinks.requestTransport(), `${expectedUrl}/solicitar-transporte`)
    assert.equal(appLinks.requestTransport('ruta/1'), `${expectedUrl}/solicitar-transporte?ruta=ruta%2F1`)
    assert.equal(appLinks.upcomingRoutes, `${expectedUrl}/proximas-rutas`)
  })
}
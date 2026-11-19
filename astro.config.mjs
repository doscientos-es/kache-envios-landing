import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, fontProviders } from 'astro/config'

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://kacheenvios.com',
  output: 'static',
  trailingSlash: 'ignore',
  compressHTML: true,
  build: { assets: '_assets' },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Poppins',
      cssVariable: '--font-poppins',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
    },
    {
      provider: fontProviders.google(),
      name: 'Amatic SC',
      cssVariable: '--font-amatic',
      weights: [400, 700],
      styles: ['normal'],
      subsets: ['latin'],
    },
  ],
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
  vite: { plugins: [tailwindcss()] },
})

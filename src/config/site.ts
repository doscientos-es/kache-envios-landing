const appUrl = (import.meta.env.PUBLIC_APP_URL || 'https://interno.kacheenvios.com').replace(
  /\/+$/,
  '',
)

export const site = {
  name: 'Kache Envíos',
  title: 'Kache Envíos · Transporte de mascotas por toda España',
  description:
    'Transporte de mascotas seguro, cómodo y con cariño por toda España. Consulta las próximas rutas, tarifas por box y solicita el viaje de tu mascota online.',
  location: 'Córdoba',
  email: 'transportedemascotas@kacheenvios.com',
  phone: {
    display: '658 60 49 33',
    href: 'tel:+34658604933',
    contactName: 'Stella',
  },
  whatsapp: 'https://wa.me/34658604933',
} as const

/** Paths of the client app (../interno). Keep aligned with `AUTH_PATHS` there. */
export const appLinks = {
  clientPortal: `${appUrl}/`,
  upcomingRoutes: `${appUrl}/proximas-rutas`,
  requestTransport: (routeId?: string) =>
    `${appUrl}/solicitar-transporte${routeId ? `?ruta=${encodeURIComponent(routeId)}` : ''}`,
} as const

export const navigation = [
  { href: '/', label: 'Inicio' },
  { href: '/#servicio', label: 'Servicio' },
  { href: '/rutas', label: 'Rutas' },
  { href: '/tarifas', label: 'Tarifas' },
  { href: '/contacto', label: 'Contacto' },
] as const

export function whatsappLink(message: string) {
  return `${site.whatsapp}?text=${encodeURIComponent(message)}`
}

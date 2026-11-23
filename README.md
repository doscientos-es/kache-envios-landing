# Kache Envíos | Landing

Landing pública de Kache Envíos, construida con Astro. Presenta información de rutas y tarifas y enlaza con la aplicación de gestión.

## Desarrollo

Requiere Node.js 22 o posterior y pnpm.

- Instalar dependencias: pnpm install
- Iniciar en local: pnpm dev
- Generar el sitio: pnpm build
- Ejecutar pruebas: pnpm test

## Configuración de rutas y tarifas

Configura `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores públicos del proyecto de la aplicación interna, tanto en local como en el entorno de despliegue, antes de generar la landing. Son variables públicas incluidas en el navegador: nunca uses la clave de servicio. Consulta `.env.example`.

Las rutas se consultan al abrir la página. La última respuesta se muestra inmediatamente desde la caché del navegador durante un máximo de 24 horas y se actualiza en segundo plano; al volver a la pestaña se comprueba de nuevo si han pasado 30 segundos. Si la conexión falla, se advierte cuando se muestra la caché o, si no existe, se ofrece el contacto por WhatsApp.

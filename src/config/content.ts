import type { IconName } from '@/lib/icons'

/** Editorial copy. Routes, dates and prices are never hardcoded: they come from Supabase. */
export const steps: { icon: IconName; glyph: string; title: string; text: string }[] = [
  {
    icon: 'paw',
    glyph: '\uf1b0',
    title: 'Recogemos tu mascota',
    text: 'Utilizando vehículos especialmente adaptados para el transporte de animales, con condiciones óptimas de temperatura y ventilación. Estamos comprometidos con el trato cariñoso y respetuoso hacia cada mascota.',
  },
  {
    icon: 'route',
    glyph: '\uf48b',
    title: 'Nuestras rutas',
    text: 'Disponemos de diferentes rutas para adaptarnos a las necesidades de cada cliente; abarcando desde la zona sur de la Península, zona centro y Norte de la misma, y la costa mediterránea.',
  },
  {
    icon: 'home',
    glyph: '\uf6d3',
    title: 'Te la entregamos',
    text: 'Te entregamos tu mascota con total seguridad de que habrá recibido un trato cariñoso y respetuoso, teniendo además un viaje tranquilo y controlado. Tu mascota ya está en tu casa. Esperamos volver a trabajar juntos.',
  },
]

export const vanFeatures: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'droplet',
    title: 'Agua en cada box',
    text: 'Depósito con bomba automática para que nunca les falte agua.',
  },
  {
    icon: 'wind',
    title: 'Aire forzado',
    text: 'Extracción automática para mantener la temperatura óptima.',
  },
  {
    icon: 'snowflake',
    title: 'Climatización',
    text: 'Aire acondicionado en techo y equipo auxiliar externo.',
  },
  {
    icon: 'sun',
    title: 'Luz y espacio',
    text: 'Habitáculo luminoso y boxes desde los más peques hasta XL.',
  },
]

export const highlights: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'mapPin',
    title: 'Entrega en toda España',
    text: 'Rutas programadas cada mes.',
  },
  {
    icon: 'truck',
    title: 'Puerta a puerta opcional',
    text: 'Servicio exclusivo si no puedes desplazarte.',
  },
  {
    icon: 'shield',
    title: 'Seguimiento constante',
    text: 'Te informamos durante todo el viaje.',
  },
]

export const testimonials = [
  {
    name: 'Tomás Medina',
    text: 'Al llegar a Gijón estaba en perfectas condiciones, feliz y sin signos de estrés. Es evidente que realmente se preocupan por el bienestar de las mascotas que transportan.',
  },
  {
    name: 'Mati Torres',
    text: 'Durante todo el viaje me mantuvieron informada sobre el progreso del traslado y el estado de mi gato. Esa comunicación constante me hizo sentir tranquila y confiada.',
  },
  {
    name: 'Laura Martínez',
    text: 'Excelente servicio trasladando a mi perro Max de Barcelona a Málaga. Desde el primer contacto el equipo fue muy profesional y atento a todas sus necesidades.',
  },
]

export const importantInfo = [
  'Toda recogida o entrega fuera de nuestros puntos de encuentro conlleva un coste extra.',
  'Solo contacta una persona por viaje con la empresa de transporte.',
  'La mascota debe tener como mínimo dos meses de edad para viajar.',
  'Los horarios se comunican siempre al cerrar la ruta.',
  'Solo transportamos mascotas.',
  'No hace falta reservar con tres semanas de antelación: con unos días es suficiente.',
  'Una vez pagado el viaje no se devuelve el importe si el cliente decide cancelar.',
  'No se carga ningún animal sin su documentación correspondiente bajo ningún concepto.',
]

export const pricingNotes = [
  'Si viaja más de un cachorro en el mismo box, o necesitas otro origen o destino, el precio varía según el número de mascotas y los kilómetros.',
  'Aves, hurones, exóticos o mascotas que no encajen en ninguno de los box: contáctanos para darte precio.',
  'El servicio puerta a puerta tiene un coste adicional según distancia y tiempo.',
]

export const faqs = [
  {
    question: '¿Cómo reservo una plaza?',
    answer:
      'Elige una ruta y pulsa «Reservar plaza». Rellenas los datos de tu mascota y del viaje online y te confirmamos la reserva. También puedes llamarnos o escribirnos por WhatsApp.',
  },
  {
    question: '¿Puedo seguir el estado de mi solicitud?',
    answer:
      'Sí. Desde «Mi panel» ves tus transportes, el estado de cada solicitud, tus mascotas y las próximas rutas disponibles.',
  },
  {
    question: '¿Qué documentación necesita mi mascota?',
    answer:
      'La documentación sanitaria obligatoria (pasaporte o cartilla, microchip y vacunas al día). Sin ella no podemos cargar al animal.',
  },
  {
    question: '¿Cuándo sé el horario exacto de recogida?',
    answer:
      'Los horarios y puntos de encuentro se comunican al cerrar la ruta, unos días antes de la salida.',
  },
]

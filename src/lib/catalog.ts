import { select } from './supabase'

export type BoxItem = {
  category: string
  label: string
  amountCents: number
  largeAmountCents: number | null
  details: string[]
  maxWeightKg: number | null
}

type BoxRow = {
  category: string
  label: string
  amount_cents: number
  large_amount_cents: number | null
  dimensions: string
  next_box_from_kg: number | null
  sort_order: number
}

/** Marketing copy per box; prices and sizes always come from the database. */
export const boxAudience: Record<string, string> = {
  pequeno: 'Gatos, cachorros y razas mini',
  mediano: 'Perros pequeños y medianos',
  grande: 'Perros grandes y razas gigantes',
  paso_rueda: 'Box adaptado al paso de rueda para perros grandes',
}

export function mapBox(row: BoxRow): BoxItem {
  return {
    category: row.category,
    label: row.label,
    amountCents: row.amount_cents,
    largeAmountCents: row.large_amount_cents,
    details: row.dimensions
      .split('·')
      .map((part) => part.trim())
      .filter(Boolean),
    maxWeightKg: row.next_box_from_kg,
  }
}

export async function fetchBoxCatalog(): Promise<BoxItem[]> {
  const rows = await select<BoxRow[]>(
    'transport_box_catalog',
    'select=category,label,amount_cents,large_amount_cents,dimensions,next_box_from_kg,sort_order&order=sort_order.asc',
  )
  return rows.map(mapBox)
}

export async function fetchBoxCatalogSafe(): Promise<BoxItem[] | null> {
  try {
    return await fetchBoxCatalog()
  } catch (error) {
    console.warn('[kache-landing] No se ha podido cargar el catálogo de boxes:', error)
    return null
  }
}

export function lowestPrice(items: BoxItem[]) {
  return items.length ? Math.min(...items.map((item) => item.amountCents)) : null
}

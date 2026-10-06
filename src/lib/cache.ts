/**
 * Browser stale-while-revalidate cache backed by localStorage. Fresh entries avoid any
 * request; stale ones are shown at once and refreshed in the background.
 */
const PREFIX = 'kache-landing:v1:'

export type Resource<T> = {
  key: string
  /** Within this age the cached data is used without contacting Supabase. */
  freshMs: number
  /** Older entries are discarded. */
  maxAgeMs: number
  load: () => Promise<T>
}

export type CacheEntry<T> = { savedAt: number; data: T }

const inflight = new Map<string, Promise<unknown>>()

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Cached entry, ignoring anything older than `notBefore` (e.g. the build snapshot). */
export function readCache<T>(resource: Resource<T>, notBefore = 0): CacheEntry<T> | null {
  try {
    const raw = storage()?.getItem(PREFIX + resource.key)
    if (!raw) return null
    const entry = JSON.parse(raw) as Partial<CacheEntry<T>>
    if (typeof entry.savedAt !== 'number' || entry.data === undefined) return null
    const age = Date.now() - entry.savedAt
    if (age < 0 || age > resource.maxAgeMs || entry.savedAt < notBefore) return null
    return entry as CacheEntry<T>
  } catch {
    return null
  }
}

export function isFresh(entry: CacheEntry<unknown>, freshMs: number) {
  return Date.now() - entry.savedAt < freshMs
}

/** Loads from the network once per key at a time and stores the result. */
export function revalidate<T>(resource: Resource<T>): Promise<T> {
  const pending = inflight.get(resource.key) as Promise<T> | undefined
  if (pending) return pending
  const request = resource
    .load()
    .then((data) => {
      try {
        const entry: CacheEntry<T> = { savedAt: Date.now(), data }
        storage()?.setItem(PREFIX + resource.key, JSON.stringify(entry))
      } catch {
        // Quota exceeded or storage disabled: the data is still used for this visit.
      }
      return data
    })
    .finally(() => inflight.delete(resource.key))
  inflight.set(resource.key, request)
  return request
}

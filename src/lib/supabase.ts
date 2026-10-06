const url = import.meta.env.PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY

const TIMEOUT_MS = 8000
const RETRIES = 2
const RETRY_BASE_MS = 500

export const isSupabaseConfigured = Boolean(url && key)

class HttpError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`Supabase ${status}: ${path}`)
  }
}

const isRetryable = (error: unknown) =>
  !(error instanceof HttpError) || error.status === 429 || error.status >= 500

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Minimal anonymous, read-only PostgREST client with timeout and retry on transient errors. */
async function request<T>(path: string, attempt = 0): Promise<T> {
  if (!url || !key) throw new Error('Supabase no está configurado')
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new HttpError(response.status, path)
    return (await response.json()) as T
  } catch (error) {
    if (attempt >= RETRIES || !isRetryable(error)) throw error
    await wait(RETRY_BASE_MS * 2 ** attempt)
    return request<T>(path, attempt + 1)
  }
}

/** Calls a `stable` RPC without arguments via GET, so `query` can pick columns (`select=…`). */
export function rpc<T>(fn: string, query = '') {
  return request<T>(`rpc/${fn}${query ? `?${query}` : ''}`)
}

export function select<T>(table: string, query: string) {
  return request<T>(`${table}?${query}`)
}

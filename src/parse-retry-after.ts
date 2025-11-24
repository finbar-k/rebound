/**
 * Parses Retry-After header value (handles both seconds and HTTP dates)
 * Extracted to separate module for reuse
 */

/**
 * Parameters for parsing Retry-After header
 */
export interface ParseRetryAfterParams {
  header: string | null | undefined
}

/**
 * Extracts Retry-After value from headers (handles both seconds and HTTP dates)
 */
export function parseRetryAfter(params: ParseRetryAfterParams): number | undefined {
  const { header: retryAfterHeader } = params
  if (!retryAfterHeader) return undefined

  // Try parsing as seconds (integer)
  const seconds = parseInt(retryAfterHeader, 10)
  if (!isNaN(seconds)) {
    return seconds
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfterHeader)
  if (!isNaN(date.getTime())) {
    const now = Date.now()
    const retryAfterMs = date.getTime() - now
    return Math.max(0, Math.floor(retryAfterMs / 1000))
  }

  return undefined
}


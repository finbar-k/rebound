/**
 * Utilities for parsing HTTP headers from various formats
 */

/**
 * Parameters for parsing headers
 */
export interface ParseHeadersParams {
  headers: unknown
}

/**
 * Parses headers from various formats (Headers object, Map, plain object) into a Record
 */
export function parseHeaders(params: ParseHeadersParams): Record<string, string> {
  const { headers } = params
  const result: Record<string, string> = {}

  if (!headers || typeof headers !== 'object') {
    return result
  }

  // Handle Headers object (Web API)
  if (headers instanceof Headers) {
    try {
      headers.forEach((value: string, key: string) => {
        result[key.toLowerCase()] = value
      })
    } catch {
      // Fallback: iterate using entries() if forEach fails or has different signature
      for (const [key, value] of headers.entries()) {
        result[key.toLowerCase()] = String(value)
      }
    }
    return result
  }

  // Handle Map
  if (headers instanceof Map) {
    for (const [key, value] of headers.entries()) {
      result[String(key).toLowerCase()] = String(value)
    }
    return result
  }

  // Handle plain object
  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      result[key.toLowerCase()] = String(value)
    }
    return result
  }

  return result
}


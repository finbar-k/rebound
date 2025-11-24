/**
 * Helper functions for retry operations
 */

import { RetryCancelledError } from '../errors.js'

/**
 * Combines multiple AbortSignals into one, with proper cleanup
 * Returns both the combined signal and a cleanup function
 */
export function combineSignals(
  ...signals: (AbortSignal | undefined)[]
): { signal: AbortSignal | undefined; cleanup: () => void } {
  const validSignals = signals.filter((s): s is AbortSignal => s !== undefined)
  
  if (validSignals.length === 0) {
    return { signal: undefined, cleanup: () => {} }
  }
  
  if (validSignals.length === 1) {
    return { signal: validSignals[0], cleanup: () => {} }
  }

  const controller = new AbortController()
  const cleanupFunctions: Array<() => void> = []
  
  const onAbort = () => {
    controller.abort()
  }

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    
    signal.addEventListener('abort', onAbort)
    cleanupFunctions.push(() => {
      signal.removeEventListener('abort', onAbort)
    })
  }

  const cleanup = () => {
    for (const fn of cleanupFunctions) {
      fn()
    }
  }

  return { signal: controller.signal, cleanup }
}

/**
 * Sleep utility with cancellation support
 * Handles race condition where signal is aborted between check and listener registration
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryCancelledError())
      return
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeoutId)
      reject(new RetryCancelledError())
    }

    signal?.addEventListener('abort', onAbort)

    // Check again after adding listener to handle race condition
    if (signal?.aborted) {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      reject(new RetryCancelledError())
    }
  })
}

/**
 * Setup timeout controller and return cleanup function
 */
export function setupTimeout(
  timeoutMs: number | undefined
): {
  controller: AbortController | null
  timeoutId: NodeJS.Timeout | null
} {
  if (!timeoutMs) {
    return { controller: null, timeoutId: null }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  return { controller, timeoutId }
}

/**
 * Cleanup timeout and signals
 */
export function cleanup(
  timeoutId: NodeJS.Timeout | null,
  cleanupSignals: () => void
): void {
  if (timeoutId) clearTimeout(timeoutId)
  cleanupSignals()
}


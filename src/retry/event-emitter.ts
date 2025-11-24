/**
 * Event emission utilities for retry operations
 */

import type { RetryAttempt, RetryEvent } from '../types.js'

/**
 * Parameters for creating retry event
 */
export interface CreateRetryEventParams<T> {
  type: RetryEvent<T>['type']
  attempt: RetryAttempt<T>
  totalAttempts: number
  estimatedRemainingMs?: number
  isLastAttempt: boolean
}

/**
 * Creates a retry event object
 */
export function createRetryEvent<T>(params: CreateRetryEventParams<T>): RetryEvent<T> {
  const { type, attempt, totalAttempts, estimatedRemainingMs, isLastAttempt } = params
  
  return {
    type,
    attempt,
    totalAttempts,
    estimatedRemainingMs,
    isLastAttempt,
  }
}

/**
 * Emits a retry event if handler is provided
 */
export function emitEvent<T>(
  onEvent: ((event: RetryEvent<T>) => void) | undefined,
  event: RetryEvent<T>
): void {
  onEvent?.(event)
}


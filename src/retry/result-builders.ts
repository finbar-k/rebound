/**
 * Helper functions for building retry results
 */

import type { RetryAttempt, RetryResult } from '../types.js'
import { computeMetrics } from '../utils/metrics.js'

/**
 * Builds a successful retry result
 */
export function buildSuccessResult<T>(
  value: T,
  attempts: RetryAttempt<T>[]
): RetryResult<T> {
  const metrics = computeMetrics({
    attempts,
    wasSuccessful: true,
  })

  return {
    value,
    attempts,
    metrics,
  }
}


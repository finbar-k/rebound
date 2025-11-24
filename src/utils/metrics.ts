/**
 * Utilities for computing retry metrics
 */

import type { RetryAttempt, RetryMetrics } from '../types.js'
import { FailureDomain } from '../types.js'

/**
 * Parameters for computing retry metrics
 */
export interface ComputeMetricsParams {
  attempts: RetryAttempt<unknown>[]
  wasSuccessful: boolean
}

/**
 * Computes metrics from retry attempts
 */
export function computeMetrics(params: ComputeMetricsParams): RetryMetrics {
  const { attempts, wasSuccessful } = params

  const totalAttempts = attempts.length
  const totalRetries = Math.max(0, totalAttempts - 1)
  const retryRate = totalAttempts > 1 ? totalRetries / totalAttempts : 0
  const successRate = wasSuccessful ? 1.0 : 0.0

  // Calculate average delay (excluding the last attempt which has delay 0)
  const delays = attempts
    .slice(0, -1)
    .map((attempt) => attempt.delay)
    .filter((delay) => delay > 0)

  const averageDelay =
    delays.length > 0
      ? delays.reduce((sum, delay) => sum + delay, 0) / delays.length
      : 0

  // Count failure domain distribution
  const failureDomainDistribution: Record<FailureDomain, number> = {
    [FailureDomain.RateLimit]: 0,
    [FailureDomain.Transient]: 0,
    [FailureDomain.Permanent]: 0,
    [FailureDomain.Unknown]: 0,
  }

  for (const attempt of attempts) {
    if (attempt.error !== null) {
      failureDomainDistribution[attempt.failureDomain] =
        (failureDomainDistribution[attempt.failureDomain] || 0) + 1
    }
  }

  return {
    retryRate,
    successRate,
    averageDelay,
    failureDomainDistribution,
    totalRetries,
  }
}


/**
 * Pre-attempt checks (cancellation, circuit breaker, rate limits)
 */

import type { RetryAttempt } from '../types.js'
import { FailureDomain } from '../types.js'
import { RetryCancelledError } from '../errors.js'
import { createRetryAttemptFailure } from '../utils.js'
import type { CircuitBreaker } from '../circuit-breaker.js'
import type { RateLimitTracker } from '../rate-limit-tracker.js'

/**
 * Parameters for pre-attempt checks
 */
export interface PreCheckParams {
  attempt: number
  combinedSignal?: AbortSignal
  circuitBreaker: CircuitBreaker | null
  rateLimitTracker: RateLimitTracker | null
}

/**
 * Result of pre-attempt checks
 */
export interface PreCheckResult<T> {
  shouldProceed: boolean
  attemptRecord?: RetryAttempt<T>
  delay?: number
}

/**
 * Performs pre-attempt checks (cancellation, circuit breaker, rate limits)
 */
export function performPreChecks<T>(params: PreCheckParams): PreCheckResult<T> {
  const {
    attempt,
    combinedSignal,
    circuitBreaker,
    rateLimitTracker,
  } = params

  // Check for cancellation
  if (combinedSignal?.aborted) {
    const cancelledError = new RetryCancelledError()
    const attemptRecord = createRetryAttemptFailure<T>({
      attempt,
      error: cancelledError,
      failureDomain: FailureDomain.Unknown,
      delay: 0,
    })

    return {
      shouldProceed: false,
      attemptRecord,
    }
  }

  // Check circuit breaker
  if (circuitBreaker && !circuitBreaker.canExecute()) {
    const circuitError = new Error(`Circuit breaker is ${circuitBreaker.getState()}`)
    const attemptRecord = createRetryAttemptFailure<T>({
      attempt,
      error: circuitError,
      failureDomain: FailureDomain.Transient,
      delay: 0,
    })

    return {
      shouldProceed: false,
      attemptRecord,
    }
  }

  // Check rate limit tracker
  if (rateLimitTracker?.isRateLimited()) {
    const timeUntilReset = rateLimitTracker.getTimeUntilReset() ?? 0
    const rateLimitError = new Error(`Rate limit active, resets in ${timeUntilReset}ms`)
    const attemptRecord = createRetryAttemptFailure<T>({
      attempt,
      error: rateLimitError,
      failureDomain: FailureDomain.RateLimit,
      delay: timeUntilReset,
    })

    return {
      shouldProceed: true, // Proceed but wait for rate limit
      attemptRecord,
      delay: timeUntilReset,
    }
  }

  return { shouldProceed: true }
}


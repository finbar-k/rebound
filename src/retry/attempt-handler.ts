/**
 * Handles individual retry attempt execution and error processing
 */

import type { RetryAttempt } from '../types.js'
import { FailureDomain } from '../types.js'
import type { FailureClassifier, RetryPolicy } from '../types.js'
import { extractResponseMetadata, createRetryAttemptSuccess, createRetryAttemptFailure } from '../utils.js'
import { validateAndClampDelay } from '../validation.js'
import { RATE_LIMIT_JITTER_FACTOR } from '../constants.js'
import type { CircuitBreaker } from '../circuit-breaker.js'
import type { RateLimitTracker } from '../rate-limit-tracker.js'

/**
 * Parameters for executing a retry attempt
 */
export interface ExecuteAttemptParams<T> {
  fn: () => Promise<T>
  attempt: number
  classifier: FailureClassifier
  policy: RetryPolicy
  circuitBreaker: CircuitBreaker | null
  rateLimitTracker: RateLimitTracker | null
}

/**
 * Result of executing an attempt
 */
export interface AttemptResult<T> {
  success: boolean
  result?: T
  error?: Error
  failureDomain: FailureDomain
  delay: number | null
  attemptRecord: RetryAttempt<T>
}

/**
 * Executes a single retry attempt and processes the result
 */
export async function executeAttempt<T>(
  params: ExecuteAttemptParams<T>
): Promise<AttemptResult<T>> {
  const { fn, attempt, classifier, policy, circuitBreaker, rateLimitTracker } = params

  try {
    // Execute the function
    const result = await fn()

    // Success
    const attemptRecord = createRetryAttemptSuccess<T>({
      attempt,
      result,
      failureDomain: FailureDomain.Unknown,
      delay: 0,
    })

    // Record success in circuit breaker
    circuitBreaker?.recordSuccess()

    // Update rate limit tracker
    rateLimitTracker?.decrement()

    return {
      success: true,
      result,
      failureDomain: FailureDomain.Unknown,
      delay: null,
      attemptRecord,
    }
  } catch (err) {
    // Preserve original error if it's an Error, otherwise wrap it
    const error = err instanceof Error ? err : new Error(String(err))
    if (!(err instanceof Error)) {
      // Store original value for debugging - using Record to avoid any type
      (error as Error & { originalValue?: unknown }).originalValue = err
    }

    const responseMetadata = extractResponseMetadata({ error })
    const failureDomain = classifier.classify({ error, response: responseMetadata })

    // Don't retry permanent errors
    if (failureDomain === FailureDomain.Permanent) {
      const attemptRecord = createRetryAttemptFailure<T>({
        attempt,
        error,
        failureDomain,
        delay: 0,
      })

      circuitBreaker?.recordFailure()

      return {
        success: false,
        error,
        failureDomain,
        delay: null,
        attemptRecord,
      }
    }

    // Calculate delay for next retry
    let delay = policy.calculateDelay({ attempt, failureDomain, error })

    // Validate policy return value before using
    if (delay !== null && (!Number.isFinite(delay) || delay < 0)) {
      delay = null
    }

    // Override delay for rate limits with Retry-After header
    if (failureDomain === FailureDomain.RateLimit && responseMetadata?.retryAfter) {
      delay = responseMetadata.retryAfter * 1000
      // Add jitter using constant
      delay = Math.floor(delay + delay * RATE_LIMIT_JITTER_FACTOR * Math.random())
    }

    // Validate and clamp delay
    delay = validateAndClampDelay({ delay })

    const attemptRecord = createRetryAttemptFailure<T>({
      attempt,
      error,
      failureDomain,
      delay: delay ?? 0,
    })

    // Record failure in circuit breaker
    circuitBreaker?.recordFailure()

    // Update rate limit tracker if we got rate limit headers
    if (failureDomain === FailureDomain.RateLimit && responseMetadata?.headers) {
      rateLimitTracker?.updateFromHeaders(responseMetadata.headers)
    }

    return {
      success: false,
      error,
      failureDomain,
      delay,
      attemptRecord,
    }
  }
}


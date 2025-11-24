import type { RetryPolicy } from '../types.js'
import { FailureDomain } from '../types.js'
import {
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_MULTIPLIER,
  EXPONENTIAL_JITTER_FACTOR,
  MIN_DELAY_MS,
} from '../constants.js'
import { RetryConfigurationError } from '../errors.js'

/**
 * Exponential backoff policy with jitter to prevent thundering herd
 */
export class ExponentialBackoffPolicy implements RetryPolicy {
  constructor(
    private readonly baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
    private readonly maxDelayMs: number = DEFAULT_MAX_DELAY_MS,
    private readonly multiplier: number = DEFAULT_MULTIPLIER
  ) {
    // Validate constructor parameters
    if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
      throw new RetryConfigurationError(
        `baseDelayMs must be a non-negative number, got: ${baseDelayMs}`
      )
    }
    if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
      throw new RetryConfigurationError(
        `maxDelayMs must be a finite number >= baseDelayMs, got: ${maxDelayMs}`
      )
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new RetryConfigurationError(
        `multiplier must be a positive number, got: ${multiplier}`
      )
    }
  }

  calculateDelay(params: import('../types.js').CalculateDelayParams): number | null {
    const { attempt, failureDomain } = params
    
    // Rate limits should respect Retry-After headers (handled elsewhere)
    if (failureDomain === FailureDomain.RateLimit) {
      return null
    }

    // Permanent errors should not retry
    if (failureDomain === FailureDomain.Permanent) {
      return null
    }

    // Calculate exponential delay with jitter
    const exponentialDelay = Math.min(
      this.baseDelayMs * Math.pow(this.multiplier, attempt - 1),
      this.maxDelayMs
    )

    // Add jitter to prevent synchronized retries
    const jitter = exponentialDelay * EXPONENTIAL_JITTER_FACTOR * (Math.random() * 2 - 1)
    return Math.max(MIN_DELAY_MS, Math.floor(exponentialDelay + jitter))
  }
}


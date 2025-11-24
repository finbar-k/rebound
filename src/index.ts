/**
 * Rebound - Intelligent, policy-driven retries for modern distributed systems
 *
 * @example
 * ```typescript
 * import { retry } from 'rebound'
 *
 * const result = await retry({
 *   fn: async () => {
 *     return await fetch('/api/data').then(r => r.json())
 *   },
 *   maxAttempts: 3,
 *   timeout: 10000,
 *   onEvent: (event) => console.log('Retry event:', event)
 * })
 * ```
 */

export { retry } from './retry.js'

export type {
  CircuitBreakerOptions,
  ClassifyErrorParams,
  CalculateDelayParams,
  ErrorWithResponse,
  FailureClassifier,
  RateLimitState,
  RetryAttempt,
  RetryAttemptFailure,
  RetryAttemptSuccess,
  RetryEvent,
  RetryMetrics,
  RetryParams,
  RetryPolicy,
  RetryResult,
  ResponseMetadata,
} from './types.js'

export { FailureDomain, isErrorWithResponse } from './types.js'

export { ExponentialBackoffPolicy, RateLimitAwarePolicy } from './policies/index.js'
export { HttpFailureClassifier } from './classifiers/index.js'

export {
  RetryCancelledError,
  RetryConfigurationError,
  RetryExhaustedError,
  RetryTimeoutError,
} from './errors.js'

export {
  createHttpError,
  extractResponseMetadata,
  createRetryAttemptSuccess,
  createRetryAttemptFailure,
} from './utils.js'
export { parseRetryAfter } from './parse-retry-after.js'
export { parseHeaders } from './utils/headers.js'
export { computeMetrics } from './utils/metrics.js'
export { CircuitBreaker } from './circuit-breaker.js'
export { RateLimitTracker } from './rate-limit-tracker.js'


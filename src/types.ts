/**
 * Failure domains represent different categories of errors that require
 * different retry strategies. This enables intelligent handling of distributed
 * system failures.
 */
export enum FailureDomain {
  /**
   * Rate limit errors (429) - should back off and respect Retry-After headers
   */
  RateLimit = 'rate-limit',

  /**
   * Transient errors (network timeouts, 503, 502) - safe to retry
   */
  Transient = 'transient',

  /**
   * Permanent errors (4xx except rate limits) - should not retry
   */
  Permanent = 'permanent',

  /**
   * Unknown errors - conservative retry strategy
   */
  Unknown = 'unknown',
}

/**
 * Base properties shared by all retry attempts
 */
interface RetryAttemptBase {
  attempt: number
  failureDomain: FailureDomain
  delay: number
  timestamp: number
}

/**
 * Successful retry attempt
 */
export interface RetryAttemptSuccess<T> extends RetryAttemptBase {
  result: T
  error: null
}

/**
 * Failed retry attempt
 */
export interface RetryAttemptFailure<_T> extends RetryAttemptBase {
  result: null
  error: Error
}

/**
 * Result of a retry attempt - discriminated union for type safety
 */
export type RetryAttempt<T> = RetryAttemptSuccess<T> | RetryAttemptFailure<T>

/**
 * Observability events emitted during retry execution
 */
export interface RetryEvent<T> {
  type: 'attempt' | 'success' | 'failure' | 'cancelled'
  attempt: RetryAttempt<T>
  totalAttempts: number
  /**
   * Estimated remaining time in milliseconds (based on current delay and remaining attempts)
   */
  estimatedRemainingMs?: number
  /**
   * Whether this is the last attempt
   */
  isLastAttempt: boolean
}

/**
 * Parameters for calculating retry delay
 */
export interface CalculateDelayParams {
  attempt: number
  failureDomain: FailureDomain
  error: Error | null
}

/**
 * Policy for calculating retry delays based on attempt number and failure domain
 */
export interface RetryPolicy {
  /**
   * Calculate delay in milliseconds before the next retry attempt
   * @param params - Parameters for delay calculation
   * @returns Delay in milliseconds, or null to stop retrying
   */
  calculateDelay(params: CalculateDelayParams): number | null
}

/**
 * Parameters for error classification
 */
export interface ClassifyErrorParams {
  error: Error
  response?: ResponseMetadata
}

/**
 * Classifies errors into failure domains for intelligent retry handling
 */
export interface FailureClassifier {
  /**
   * Classify an error into a failure domain
   * @param params - Parameters for error classification
   * @returns The classified failure domain
   */
  classify(params: ClassifyErrorParams): FailureDomain
}

/**
 * HTTP response metadata for error classification
 */
export interface ResponseMetadata {
  status?: number
  headers?: Record<string, string>
  retryAfter?: number
}

/**
 * Error that may contain HTTP response metadata
 * Used for type-safe error handling without `as any` casts
 */
export interface ErrorWithResponse extends Error {
  response?: ResponseMetadata
  status?: number
  headers?: Record<string, string>
  retryAfter?: number
}

/**
 * Type guard to check if an error has response metadata
 */
export function isErrorWithResponse(error: unknown): error is ErrorWithResponse {
  if (!(error instanceof Error)) return false
  const err = error as ErrorWithResponse
  return err.response !== undefined || err.status !== undefined || err.headers !== undefined
}

/**
 * Parameters for retry operation
 */
export interface RetryParams<T> {
  /**
   * The async function to retry
   */
  fn: () => Promise<T>

  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxAttempts?: number

  /**
   * Retry policy to use (default: exponential backoff)
   */
  policy?: RetryPolicy

  /**
   * Failure classifier (default: HTTP-aware classifier)
   */
  classifier?: FailureClassifier

  /**
   * AbortSignal for cancellation support
   */
  signal?: AbortSignal

  /**
   * Overall timeout in milliseconds (includes all retries)
   */
  timeout?: number

  /**
   * Whether the operation is idempotent (affects retry safety)
   */
  idempotent?: boolean

  /**
   * Observability hook called on each retry event
   * Preserves the generic type T from the retry operation
   */
  onEvent?: <T>(event: RetryEvent<T>) => void

  /**
   * Circuit breaker configuration for distributed systems resilience
   */
  circuitBreaker?: CircuitBreakerOptions

  /**
   * Rate limit state for enhanced rate limiting
   */
  rateLimitState?: RateLimitState | (() => RateLimitState)
}

/**
 * Circuit breaker configuration for preventing cascading failures
 */
export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening the circuit
   */
  failureThreshold: number
  /**
   * Number of successes needed to close the circuit
   */
  successThreshold: number
  /**
   * Timeout in milliseconds before attempting to close circuit
   */
  timeout: number
  /**
   * Optional callback when circuit opens/closes
   */
  onStateChange?: (state: 'open' | 'closed' | 'half-open') => void
}

/**
 * Rate limit state for tracking rate limits across requests
 */
export interface RateLimitState {
  /**
   * Remaining requests in current window
   */
  remaining: number
  /**
   * Timestamp when rate limit resets (milliseconds)
   */
  resetAt: number
  /**
   * Total limit for the window
   */
  limit: number
  /**
   * Optional: Different limits per endpoint
   */
  perEndpoint?: Record<string, Omit<RateLimitState, 'perEndpoint'>>
}

/**
 * Metrics computed from retry attempts
 */
export interface RetryMetrics {
  /**
   * Retry rate (number of retries / total attempts)
   */
  retryRate: number
  /**
   * Success rate (1.0 if successful, 0.0 if failed)
   */
  successRate: number
  /**
   * Average delay between retries in milliseconds
   */
  averageDelay: number
  /**
   * Distribution of failure domains encountered
   */
  failureDomainDistribution: Record<FailureDomain, number>
  /**
   * Total number of retries (attempts - 1)
   */
  totalRetries: number
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  value: T
  attempts: RetryAttempt<T>[]
  /**
   * Computed metrics from the retry operation
   */
  metrics: RetryMetrics
}


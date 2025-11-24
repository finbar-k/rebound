/**
 * Custom error classes for retry operations
 */

/**
 * Base class for all retry-related errors
 */
export abstract class RetryError extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    // captureStackTrace may not exist in all environments
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * Error thrown when a retry operation is cancelled
 */
export class RetryCancelledError extends RetryError {
  readonly code = 'RETRY_CANCELLED'

  constructor(message = 'Operation cancelled') {
    super(message)
  }
}

/**
 * Error thrown when all retry attempts are exhausted
 */
export class RetryExhaustedError extends RetryError {
  readonly code = 'RETRY_EXHAUSTED'
  readonly attempts: number
  readonly lastError?: Error
  readonly failureDomain?: import('./types.js').FailureDomain
  readonly totalDuration?: number

  constructor(
    attempts: number,
    lastError?: Error,
    failureDomain?: import('./types.js').FailureDomain,
    totalDuration?: number
  ) {
    const parts = [`Retry exhausted after ${attempts} attempts`]
    if (lastError) parts.push(`(last error: ${lastError.message})`)
    if (failureDomain) parts.push(`[${failureDomain}]`)
    if (totalDuration !== undefined) parts.push(`after ${totalDuration}ms`)
    
    super(parts.join(' '))
    this.attempts = attempts
    this.lastError = lastError
    this.failureDomain = failureDomain
    this.totalDuration = totalDuration
  }
}

/**
 * Error thrown when a retry operation times out
 */
export class RetryTimeoutError extends RetryError {
  readonly code = 'RETRY_TIMEOUT'
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`)
    this.timeoutMs = timeoutMs
  }
}

/**
 * Error thrown when invalid retry options are provided
 */
export class RetryConfigurationError extends RetryError {
  readonly code = 'RETRY_CONFIGURATION_ERROR'

  constructor(message: string) {
    super(`Invalid retry configuration: ${message}`)
  }
}


/**
 * Constants used throughout the retry library
 */

/**
 * Default maximum number of retry attempts
 */
export const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Default base delay for exponential backoff (milliseconds)
 */
export const DEFAULT_BASE_DELAY_MS = 1000

/**
 * Default maximum delay cap for exponential backoff (milliseconds)
 */
export const DEFAULT_MAX_DELAY_MS = 30000

/**
 * Default multiplier for exponential backoff
 */
export const DEFAULT_MULTIPLIER = 2

/**
 * Jitter factor for exponential backoff (±25%)
 */
export const EXPONENTIAL_JITTER_FACTOR = 0.25

/**
 * Jitter factor for rate limit Retry-After headers (±10%)
 */
export const RATE_LIMIT_JITTER_FACTOR = 0.1

/**
 * Minimum delay in milliseconds (prevents negative or zero delays)
 */
export const MIN_DELAY_MS = 0

/**
 * Maximum reasonable delay in milliseconds (safety cap)
 */
export const MAX_REASONABLE_DELAY_MS = 300000 // 5 minutes


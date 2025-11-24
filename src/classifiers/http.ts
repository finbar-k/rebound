import type { FailureClassifier } from '../types.js'
import { FailureDomain } from '../types.js'

/**
 * HTTP-aware failure classifier that understands HTTP status codes
 * and response headers for intelligent error classification
 */
export class HttpFailureClassifier implements FailureClassifier {
  classify(params: import('../types.js').ClassifyErrorParams): FailureDomain {
    const { error, response } = params
    
    // Check for rate limit status code
    if (response?.status === 429) {
      return FailureDomain.RateLimit
    }

    // Check for Retry-After header (even without 429 status)
    if (response?.retryAfter) {
      return FailureDomain.RateLimit
    }

    // Check for transient server errors (5xx)
    if (response?.status && response.status >= 500) {
      return FailureDomain.Transient
    }

    // Check for client errors (permanent)
    if (response?.status && response.status >= 400 && response.status < 500) {
      return FailureDomain.Permanent
    }

    // Check error message for common transient patterns
    const errorMessage = error.message.toLowerCase()
    const transientPatterns = [
      'timeout',
      'econnreset',
      'enotfound',
      'econnrefused',
      'etimedout',
      'network',
      'temporary',
      'unavailable',
    ]

    if (transientPatterns.some((pattern) => errorMessage.includes(pattern))) {
      return FailureDomain.Transient
    }

    // Default to unknown for unclassified errors
    return FailureDomain.Unknown
  }
}


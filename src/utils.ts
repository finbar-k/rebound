/**
 * Utility functions for working with rebound
 */

import type { ErrorWithResponse, ResponseMetadata, RetryAttemptFailure, RetryAttemptSuccess } from './types.js'
import { FailureDomain, isErrorWithResponse } from './types.js'
import { parseRetryAfter } from './parse-retry-after.js'
import { parseHeaders } from './utils/headers.js'
import { validateAttemptNumber } from './validation.js'

/**
 * Parameters for creating HTTP error
 */
export interface CreateHttpErrorParams {
  message: string
  metadata: ResponseMetadata
}

/**
 * Creates an error with HTTP response metadata for proper classification
 * 
 * @example
 * ```typescript
 * const response = await fetch('/api')
 * if (response.status === 429) {
 *   throw createHttpError({
 *     message: 'Rate limited',
 *     metadata: {
 *       status: 429,
 *       headers: { 'retry-after': response.headers.get('retry-after') || '60' }
 *     }
 *   })
 * }
 * ```
 */
export function createHttpError(params: CreateHttpErrorParams): ErrorWithResponse {
  const { message, metadata } = params
  const error = new Error(message) as ErrorWithResponse
  error.response = metadata
  if (metadata.status !== undefined) error.status = metadata.status
  if (metadata.headers !== undefined) error.headers = metadata.headers
  if (metadata.retryAfter !== undefined) error.retryAfter = metadata.retryAfter
  return error
}

/**
 * Parameters for extracting response metadata
 */
export interface ExtractResponseMetadataParams {
  error: Error
}

/**
 * Extracts response metadata from an error if it's an HTTP error.
 * Handles various error formats from different HTTP libraries.
 */
export function extractResponseMetadata(params: ExtractResponseMetadataParams): ResponseMetadata | undefined {
  const { error } = params
  if (!isErrorWithResponse(error)) {
    return undefined
  }

  const err = error

  // Check if error has response-like properties (common in fetch libraries)
  if (err.response) {
    const response = err.response
    const headers = response.headers ? parseHeaders({ headers: response.headers }) : {}

    // Parse Retry-After header using shared utility
    const retryAfterHeader = headers['retry-after']
    const retryAfter = retryAfterHeader ? parseRetryAfter({ header: retryAfterHeader }) : undefined

    return {
      status: response.status,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      retryAfter,
    }
  }

  // Check for direct status/headers on error (alternative format)
  if (err.status !== undefined || err.headers !== undefined) {
    const headers = err.headers ? parseHeaders({ headers: err.headers }) : {}

    const retryAfterHeader = headers['retry-after']
    const retryAfter = retryAfterHeader ? parseRetryAfter({ header: retryAfterHeader }) : err.retryAfter

    return {
      status: err.status,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      retryAfter,
    }
  }

  return undefined
}

/**
 * Parameters for creating successful retry attempt
 */
export interface CreateRetryAttemptSuccessParams<T> {
  attempt: number
  result: T
  failureDomain: FailureDomain
  delay: number
}

/**
 * Creates a successful RetryAttempt object
 */
export function createRetryAttemptSuccess<T>(
  params: CreateRetryAttemptSuccessParams<T>
): RetryAttemptSuccess<T> {
  const { attempt, result, failureDomain, delay } = params
  validateAttemptNumber({ attempt })
  return {
    attempt,
    result,
    error: null,
    failureDomain,
    delay,
    timestamp: Date.now(),
  }
}

/**
 * Parameters for creating failed retry attempt
 */
export interface CreateRetryAttemptFailureParams<_T> {
  attempt: number
  error: Error
  failureDomain: FailureDomain
  delay: number
}

/**
 * Creates a failed RetryAttempt object
 */
export function createRetryAttemptFailure<T>(
  params: CreateRetryAttemptFailureParams<T>
): RetryAttemptFailure<T> {
  const { attempt, error, failureDomain, delay } = params
  validateAttemptNumber({ attempt })
  return {
    attempt,
    result: null,
    error,
    failureDomain,
    delay,
    timestamp: Date.now(),
  }
}

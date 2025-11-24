/**
 * Input validation for retry options
 */

import { RetryConfigurationError } from './errors.js'
import { MAX_REASONABLE_DELAY_MS, MIN_DELAY_MS } from './constants.js'

/**
 * Parameters for validating retry options
 */
export interface ValidateRetryOptionsParams {
  maxAttempts?: number
  timeout?: number
}

/**
 * Validates retry options and throws descriptive errors for invalid inputs
 */
export function validateRetryOptions(params: ValidateRetryOptionsParams): void {
  const { maxAttempts, timeout } = params
  if (maxAttempts !== undefined) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RetryConfigurationError(
        `maxAttempts must be a positive integer, got: ${maxAttempts}`
      )
    }
  }

  if (timeout !== undefined) {
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new RetryConfigurationError(
        `timeout must be a positive number, got: ${timeout}`
      )
    }
  }
}

/**
 * Parameters for validating and clamping delay
 */
export interface ValidateAndClampDelayParams {
  delay: number | null
}

/**
 * Validates and clamps a delay value to reasonable bounds
 */
export function validateAndClampDelay(params: ValidateAndClampDelayParams): number | null {
  const { delay } = params
  if (delay === null) return null
  
  if (!Number.isFinite(delay) || delay < MIN_DELAY_MS) {
    return MIN_DELAY_MS
  }

  return Math.min(Math.floor(delay), MAX_REASONABLE_DELAY_MS)
}

/**
 * Parameters for validating attempt number
 */
export interface ValidateAttemptNumberParams {
  attempt: number
}

/**
 * Validates that an attempt number is valid
 */
export function validateAttemptNumber(params: ValidateAttemptNumberParams): void {
  const { attempt } = params
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RetryConfigurationError(
      `Attempt number must be a positive integer, got: ${attempt}`
    )
  }
}


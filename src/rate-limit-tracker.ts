/**
 * Rate limit state tracker for enhanced rate limiting
 * Tracks rate limit state across requests to enable preemptive backoff
 */

import type { RateLimitState } from './types.js'

/**
 * Parameters for rate limit tracker
 */
export interface RateLimitTrackerParams {
  initialState?: RateLimitState | (() => RateLimitState)
}

/**
 * Rate limit tracker for managing rate limit state
 */
export class RateLimitTracker {
  private state: RateLimitState | null = null

  constructor(params: RateLimitTrackerParams) {
    if (params.initialState) {
      this.state =
        typeof params.initialState === 'function'
          ? params.initialState()
          : params.initialState
    }
  }

  /**
   * Get current rate limit state
   */
  getState(): RateLimitState | null {
    return this.state
  }

  /**
   * Update rate limit state from response headers
   */
  updateFromHeaders(headers: Record<string, string>, endpoint?: string): void {
    const remaining = this.parseHeader(headers, 'x-ratelimit-remaining')
    const limit = this.parseHeader(headers, 'x-ratelimit-limit')
    const reset = this.parseHeader(headers, 'x-ratelimit-reset')

    if (remaining !== null && limit !== null && reset !== null) {
      const resetAt = reset * 1000 // Convert to milliseconds

      if (endpoint && this.state?.perEndpoint) {
        // Update per-endpoint state
        this.state.perEndpoint[endpoint] = {
          remaining,
          resetAt,
          limit,
        }
      } else {
        // Update global state
        this.state = {
          remaining,
          resetAt,
          limit,
        }
      }
    }
  }

  /**
   * Check if rate limit is likely to be hit soon
   */
  shouldBackoff(threshold: number = 0.1): boolean {
    if (!this.state) return false

    const { remaining, limit } = this.state
    const utilization = (limit - remaining) / limit

    return utilization >= 1 - threshold
  }

  /**
   * Get time until rate limit resets (in milliseconds)
   */
  getTimeUntilReset(): number | null {
    if (!this.state) return null

    const now = Date.now()
    const resetAt = this.state.resetAt

    return Math.max(0, resetAt - now)
  }

  /**
   * Check if rate limit is currently active
   */
  isRateLimited(): boolean {
    if (!this.state) return false

    return this.state.remaining <= 0 && Date.now() < this.state.resetAt
  }

  /**
   * Decrement remaining count (after making a request)
   */
  decrement(endpoint?: string): void {
    if (!this.state) return

    if (endpoint && this.state.perEndpoint?.[endpoint]) {
      const endpointState = this.state.perEndpoint[endpoint]
      endpointState.remaining = Math.max(0, endpointState.remaining - 1)
    } else {
      this.state.remaining = Math.max(0, this.state.remaining - 1)
    }
  }

  private parseHeader(
    headers: Record<string, string>,
    name: string
  ): number | null {
    const value = headers[name.toLowerCase()]
    if (!value) return null

    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? null : parsed
  }
}


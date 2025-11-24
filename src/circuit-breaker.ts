/**
 * Circuit breaker implementation for distributed systems resilience
 * Prevents cascading failures by opening circuit after threshold failures
 */

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Parameters for circuit breaker
 */
export interface CircuitBreakerParams {
  failureThreshold: number
  successThreshold: number
  timeout: number
  onStateChange?: (state: CircuitState) => void
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private successCount = 0
  private lastFailureTime: number | null = null

  constructor(private readonly params: CircuitBreakerParams) {}

  /**
   * Check if circuit allows execution
   */
  canExecute(): boolean {
    const now = Date.now()

    if (this.state === 'closed') {
      return true
    }

    if (this.state === 'open') {
      // Check if timeout has passed
      if (
        this.lastFailureTime &&
        now - this.lastFailureTime >= this.params.timeout
      ) {
        this.transitionTo('half-open')
        return true
      }
      return false
    }

    // half-open state - allow one attempt
    return true
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++
      if (this.successCount >= this.params.successThreshold) {
        this.transitionTo('closed')
        this.successCount = 0
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(): void {
    this.lastFailureTime = Date.now()
    this.failureCount++

    if (this.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.transitionTo('open')
      this.successCount = 0
    } else if (
      this.state === 'closed' &&
      this.failureCount >= this.params.failureThreshold
    ) {
      this.transitionTo('open')
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = 'closed'
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.params.onStateChange?.('closed')
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState
      this.params.onStateChange?.(newState)
    }
  }
}


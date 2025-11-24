# rebound

Intelligent, policy-driven retries for modern distributed systems.

## Philosophy

Rebound goes beyond simple exponential backoff. It's designed by someone who deeply understands:

- **Distributed systems** - Failure domains, network partitions, cascading failures
- **Idempotency** - Safe retry semantics for operations that can be safely repeated
- **Rate-limiting interplay** - Respects `Retry-After` headers and rate limit responses
- **Timeout & cancellation** - Proper `AbortSignal` support and timeout handling
- **Failure domains** - Different retry strategies for different error types
- **Observability** - Built-in event hooks for monitoring and debugging
- **Pluggable policies** - Extensible architecture for custom retry strategies
- **Ergonomic DX** - Simple API that hides complexity without sacrificing power

## Features

- 🎯 **Failure Domain Classification** - Automatically classifies errors (rate limits, transient, permanent)
- ⏱️ **Rate Limit Awareness** - Respects `Retry-After` headers from HTTP 429 responses
- 🚫 **Timeout & Cancellation** - Full `AbortSignal` support for cancellation
- 📊 **Observability** - Event hooks for monitoring retry attempts
- 🔌 **Pluggable Policies** - Custom retry strategies via policy interface
- 🛡️ **Idempotency Support** - Explicit idempotency flag for operation safety
- 🎲 **Jitter** - Prevents thundering herd with randomized delays

## Installation

```bash
npm install rebound
```

## Quick Start

```typescript
import { retry } from 'rebound'

const result = await retry({
  fn: async () => {
    const response = await fetch('/api/data')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  maxAttempts: 3,
  timeout: 10000
})
```

## Advanced Usage

### Custom Retry Policy

```typescript
import { retry, RetryPolicy, FailureDomain } from 'rebound'

class CustomPolicy implements RetryPolicy {
  calculateDelay({ attempt, failureDomain }): number | null {
    // Custom logic here
    if (failureDomain === FailureDomain.Permanent) return null
    return attempt * 1000 // Linear backoff
  }
}

await retry({ fn, policy: new CustomPolicy() })
```

### Observability

```typescript
await retry({
  fn,
  onEvent: (event) => {
    console.log(`Attempt ${event.attempt.attempt}: ${event.type}`)
    console.log(`Failure domain: ${event.attempt.failureDomain}`)
    console.log(`Delay: ${event.attempt.delay}ms`)
  }
})
```

### Cancellation

```typescript
const controller = new AbortController()

setTimeout(() => controller.abort(), 5000)

await retry({
  fn,
  signal: controller.signal,
  maxAttempts: 10
})
```

### Rate Limit Handling

Rebound automatically detects HTTP 429 responses and respects `Retry-After` headers:

```typescript
import { retry, createHttpError } from 'rebound'

// If the API returns 429 with Retry-After: 60
// Rebound will wait 60 seconds before retrying
await retry({
  fn: async () => {
    const res = await fetch('/api')
    if (res.status === 429) {
      throw createHttpError({
        message: 'Rate limited',
        metadata: {
          status: 429,
          headers: { 'retry-after': res.headers.get('retry-after') || '60' }
        }
      })
    }
    return res.json()
  }
})
```

### Custom Failure Classifier

```typescript
import { FailureClassifier, FailureDomain } from 'rebound'

class MyClassifier implements FailureClassifier {
  classify({ error }): FailureDomain {
    // Custom classification logic
    if (error.message.includes('timeout')) {
      return FailureDomain.Transient
    }
    return FailureDomain.Unknown
  }
}

await retry({ fn, classifier: new MyClassifier() })
```

### Creating HTTP Errors

For better error classification, use the utility function to create errors with response metadata:

```typescript
import { retry, createHttpError } from 'rebound'

await retry({
  fn: async () => {
    const response = await fetch('/api')
    
    if (response.status === 429) {
      throw createHttpError({
        message: 'Rate limited',
        metadata: {
          status: 429,
          headers: {
            'retry-after': response.headers.get('retry-after') || '60'
          }
        }
      })
    }
    
    return response.json()
  }
})
```

## API Reference

### `retry<T>(params)`

Execute a function with retry logic.

**Parameters:**
- `params: RetryParams<T>` - Retry configuration object
  - `fn: () => Promise<T>` - The async function to retry
  - `maxAttempts?: number` - Maximum retry attempts (default: 3)
  - `policy?: RetryPolicy` - Retry policy (default: RateLimitAwarePolicy)
  - `classifier?: FailureClassifier` - Error classifier (default: HttpFailureClassifier)
  - `signal?: AbortSignal` - Cancellation signal
  - `timeout?: number` - Overall timeout in milliseconds
  - `idempotent?: boolean` - Whether operation is idempotent
  - `onEvent?: (event: RetryEvent<T>) => void` - Observability hook

**Returns:** `Promise<RetryResult<T>>`

### `RetryParams<T>`

```typescript
interface RetryParams<T> {
  fn: () => Promise<T>        // Function to retry
  maxAttempts?: number        // Default: 3
  policy?: RetryPolicy        // Default: RateLimitAwarePolicy
  classifier?: FailureClassifier // Default: HttpFailureClassifier
  signal?: AbortSignal        // For cancellation
  timeout?: number            // Overall timeout in ms
  idempotent?: boolean        // Whether operation is idempotent
  onEvent?: (event: RetryEvent<T>) => void // Observability hook
  circuitBreaker?: CircuitBreakerOptions // Circuit breaker config
  rateLimitState?: RateLimitState | (() => RateLimitState) // Rate limit state
}
```

### `RetryResult<T>`

```typescript
interface RetryResult<T> {
  value: T                    // Final result
  attempts: RetryAttempt<T>[] // All retry attempts
  metrics: RetryMetrics       // Computed metrics
}
```

### `RetryMetrics`

```typescript
interface RetryMetrics {
  retryRate: number                                    // Retry rate (0-1)
  successRate: number                                  // Success rate (0-1)
  averageDelay: number                                 // Average delay in ms
  failureDomainDistribution: Record<FailureDomain, number> // Domain counts
  totalRetries: number                                 // Total retry count
}
```

### `FailureDomain`

```typescript
enum FailureDomain {
  RateLimit = 'rate-limit',  // 429 errors, rate limits
  Transient = 'transient',    // Network errors, 5xx
  Permanent = 'permanent',   // 4xx errors (except rate limits)
  Unknown = 'unknown'        // Unclassified errors
}
```

## Advanced Features

### Circuit Breaker

Prevent cascading failures with optional circuit breaker support:

```typescript
await retry({
  fn: async () => externalApiCall(),
  circuitBreaker: {
    failureThreshold: 5,      // Open after 5 failures
    successThreshold: 2,     // Close after 2 successes
    timeout: 60000,          // Try closing after 60s
    onStateChange: (state) => console.log(`Circuit: ${state}`)
  }
})
```

### Rate Limit State Tracking

Track rate limits across requests for proactive backoff:

```typescript
const rateLimitState: RateLimitState = {
  remaining: 100,
  resetAt: Date.now() + 3600000,
  limit: 100
}

await retry({
  fn: async () => apiCall(),
  rateLimitState: () => rateLimitState
})
```

### Enhanced Observability

Access detailed metrics from retry operations:

```typescript
const result = await retry({ fn: fetchData })

console.log('Retry rate:', result.metrics.retryRate)
console.log('Success rate:', result.metrics.successRate)
console.log('Average delay:', result.metrics.averageDelay)
console.log('Failure domains:', result.metrics.failureDomainDistribution)
```

Events include estimated remaining time:

```typescript
await retry({
  fn: async () => fetchData(),
  onEvent: (event) => {
    console.log(`Remaining: ${event.estimatedRemainingMs}ms`)
    console.log(`Last attempt: ${event.isLastAttempt}`)
    console.log(`Attempt ${event.attempt.attempt} of ${event.totalAttempts}`)
  }
})
```

## Architecture

Rebound is built with a clean separation of concerns:

- **Policies** - Calculate retry delays (`RetryPolicy`)
- **Classifiers** - Classify errors into failure domains (`FailureClassifier`)
- **Circuit Breaker** - Prevent cascading failures (optional)
- **Rate Limit Tracker** - Track rate limit state (optional)
- **Engine** - Orchestrates retries, handles timeouts, emits events
- **Metrics** - Computes retry statistics and failure distributions

This architecture makes it easy to extend Rebound with custom behavior while keeping the core simple and focused.

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed design decisions.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - Design decisions and system architecture
- [Best Practices](./docs/BEST_PRACTICES.md) - Usage guidelines and patterns
- [Production Guide](./docs/PRODUCTION.md) - Production deployment considerations
- [Troubleshooting](./docs/TROUBLESHOOTING.md) - Common issues and solutions

## License

MIT

# Best Practices

Guidelines for using rebound effectively in production systems.

## When to Retry

### ✅ Safe to Retry

- **Idempotent operations**: GET requests, read-only operations
- **Transient failures**: Network timeouts, 5xx errors, connection resets
- **Rate limits**: When respecting Retry-After headers
- **Temporary unavailability**: 503 Service Unavailable

### ❌ Don't Retry

- **Non-idempotent operations**: POST/PUT/DELETE without idempotency keys
- **Permanent errors**: 4xx errors (except rate limits)
- **Authentication failures**: 401 Unauthorized
- **Authorization failures**: 403 Forbidden
- **Validation errors**: 400 Bad Request

## Idempotency

### Making Operations Idempotent

1. **Use idempotency keys**: Include unique keys in requests
2. **Use PUT instead of POST**: PUT is naturally idempotent
3. **Check before create**: Verify existence before creating
4. **Use conditional requests**: ETags, If-Match headers

```typescript
// Good: Idempotent operation
await retry({
  fn: async () => {
    // GET is naturally idempotent
    return await fetch('/api/data').then(r => r.json())
  },
  idempotent: true
})

// Good: Idempotent with key
await retry({
  fn: async () => {
    return await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Idempotency-Key': generateIdempotencyKey()
      }
    }).then(r => r.json())
  },
  idempotent: true
})
```

## Rate Limiting

### Respecting Rate Limits

Always use `createHttpError` for rate limit errors to ensure proper classification:

```typescript
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

### Rate Limit State Tracking

For APIs with rate limit headers, use state tracking:

```typescript
const rateLimitState: RateLimitState = {
  remaining: 100,
  resetAt: Date.now() + 3600000, // 1 hour
  limit: 100
}

await retry({
  fn: async () => {
    const response = await fetch('/api')
    
    // Update state from headers
    const headers: Record<string, string> = {}
    response.headers.forEach((v, k) => { headers[k] = v })
    
    // Update tracker (would be done automatically in real implementation)
    
    return response.json()
  },
  rateLimitState: () => rateLimitState
})
```

## Circuit Breakers

### When to Use Circuit Breakers

Use circuit breakers for:
- **External APIs**: Third-party services that may be down
- **Microservices**: Services in your own system
- **Database connections**: When connection pool is exhausted
- **Any critical dependency**: Services that can cascade failures

```typescript
await retry({
  fn: async () => {
    return await externalApiCall()
  },
  circuitBreaker: {
    failureThreshold: 5,      // Open after 5 failures
    successThreshold: 2,     // Close after 2 successes
    timeout: 60000,          // Try closing after 60s
    onStateChange: (state) => {
      console.log(`Circuit breaker: ${state}`)
    }
  }
})
```

## Observability

### Event Handling

Always provide an `onEvent` handler for production monitoring:

```typescript
await retry({
  fn: async () => fetchData(),
  onEvent: (event) => {
    // Log to your monitoring system
    logger.info('retry-event', {
      type: event.type,
      attempt: event.attempt.attempt,
      elapsedMs: event.elapsedMs,
      failureDomain: event.attempt.failureDomain,
      isLastAttempt: event.isLastAttempt
    })
    
    // Emit metrics
    metrics.increment('retry.attempts', {
      type: event.type,
      domain: event.attempt.failureDomain
    })
  }
})
```

### Metrics Usage

Use computed metrics for dashboards and alerts:

```typescript
const result = await retry({ fn: fetchData })

// Monitor retry rate
if (result.metrics.retryRate > 0.5) {
  alert('High retry rate detected')
}

// Monitor failure domains
const transientFailures = result.metrics.failureDomainDistribution[FailureDomain.Transient]
if (transientFailures > 10) {
  alert('Many transient failures')
}
```

## Error Handling

### Proper Error Classification

Ensure errors are properly classified by using `createHttpError`:

```typescript
// Good: Properly classified error
try {
  const response = await fetch('/api')
  if (!response.ok) {
    throw createHttpError({
      message: `HTTP ${response.status}`,
      metadata: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      }
    })
  }
  return response.json()
} catch (error) {
  // Error will be properly classified
  throw error
}
```

### Error Context

Preserve error context for debugging:

```typescript
const result = await retry({
  fn: async () => {
    try {
      return await riskyOperation()
    } catch (error) {
      // Add context
      ;(error as any).context = { userId, operationId }
      throw error
    }
  }
})

// Access last error if failed
if (!result.metrics.successRate) {
  const lastError = result.attempts[result.attempts.length - 1].error
  console.error('Failed with context:', (lastError as any).context)
}
```

## Timeout Configuration

### Setting Appropriate Timeouts

- **Fast APIs**: 5-10 seconds
- **Standard APIs**: 10-30 seconds
- **Slow operations**: 60+ seconds
- **Overall timeout**: Should account for all retries

```typescript
// Good: Timeout accounts for retries
await retry({
  fn: async () => fetchData(),
  maxAttempts: 3,
  timeout: 30000, // 30s total (10s per attempt average)
})
```

## Cancellation

### Using AbortSignal

Always support cancellation for user-initiated operations:

```typescript
const controller = new AbortController()

// User cancels
button.onclick = () => controller.abort()

try {
  await retry({
    fn: async () => fetchData(),
    signal: controller.signal,
    maxAttempts: 10
  })
} catch (error) {
  if (error instanceof RetryCancelledError) {
    // Handle cancellation gracefully
    showMessage('Operation cancelled')
  }
}
```

## Performance

### Minimize Retry Attempts

- Use appropriate `maxAttempts` (3-5 is usually sufficient)
- Don't retry on permanent errors (handled automatically)
- Use circuit breakers to fail fast when service is down

### Optimize Delay Policies

- Use jitter to prevent thundering herd
- Respect rate limit headers
- Don't retry too aggressively

## Testing

### Testing Retry Logic

```typescript
// Test retry behavior
it('should retry on transient errors', async () => {
  const fn = vi.fn()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce('success')
  
  const result = await retry({ fn, maxAttempts: 3 })
  
  expect(result.value).toBe('success')
  expect(result.metrics.totalRetries).toBe(1)
  expect(result.metrics.retryRate).toBe(0.5)
})
```

### Testing Circuit Breakers

```typescript
it('should open circuit after threshold', async () => {
  const fn = vi.fn().mockRejectedValue(new Error('fail'))
  
  const circuitBreaker = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000
  }
  
  // First 3 attempts should fail
  for (let i = 0; i < 3; i++) {
    await expect(retry({ fn, circuitBreaker, maxAttempts: 1 }))
      .rejects.toThrow()
  }
  
  // 4th attempt should be blocked by circuit breaker
  await expect(retry({ fn, circuitBreaker, maxAttempts: 1 }))
    .rejects.toThrow('Circuit breaker is open')
})
```

## Common Pitfalls

### ❌ Don't Retry Everything

```typescript
// Bad: Retrying non-idempotent operations
await retry({
  fn: async () => {
    // This could create duplicate orders!
    return await fetch('/api/orders', { method: 'POST', body: orderData })
  },
  maxAttempts: 5
})
```

### ❌ Don't Ignore Permanent Errors

```typescript
// Bad: Retrying 400 errors
// Good: Rebound automatically skips permanent errors
await retry({
  fn: async () => {
    const response = await fetch('/api')
    if (response.status === 400) {
      // Rebound will not retry this automatically
      throw createHttpError({
        message: 'Bad request',
        metadata: { status: 400 }
      })
    }
    return response.json()
  }
})
```

### ❌ Don't Set Timeouts Too High

```typescript
// Bad: 5 minute timeout for fast API
await retry({
  fn: async () => fetchFastApi(),
  timeout: 300000 // Too high!
})

// Good: Appropriate timeout
await retry({
  fn: async () => fetchFastApi(),
  timeout: 10000 // 10 seconds
})
```

## Production Checklist

- [ ] Set appropriate `maxAttempts` (3-5)
- [ ] Configure timeouts based on operation type
- [ ] Use `idempotent: true` for safe operations
- [ ] Implement `onEvent` handler for monitoring
- [ ] Use circuit breakers for external dependencies
- [ ] Track rate limit state for rate-limited APIs
- [ ] Monitor retry metrics in production
- [ ] Set up alerts for high retry rates
- [ ] Test cancellation scenarios
- [ ] Document retry behavior for your team


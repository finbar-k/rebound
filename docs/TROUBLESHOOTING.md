# Troubleshooting Guide

Common issues and solutions when using rebound.

## High Retry Rates

### Symptom
`result.metrics.retryRate > 0.3` (30%+ of requests retry)

### Possible Causes

1. **Service instability**
   - Check service health metrics
   - Review error logs
   - Check for recent deployments

2. **Network issues**
   - Check network connectivity
   - Review DNS resolution
   - Check firewall rules

3. **Timeout too low**
   - Increase timeout if operations are legitimately slow
   - Check if timeout accounts for all retries

4. **Rate limiting**
   - Check if hitting rate limits
   - Review rate limit headers
   - Verify rate limit state tracking

### Solutions

```typescript
// Check failure domain distribution
const result = await retry({ fn: fetchData })
console.log(result.metrics.failureDomainDistribution)

// If transient failures are high, service may be unstable
if (result.metrics.failureDomainDistribution[FailureDomain.Transient] > 10) {
  // Investigate service health
}

// If rate limit failures are high, check rate limits
if (result.metrics.failureDomainDistribution[FailureDomain.RateLimit] > 5) {
  // Review rate limit configuration
}
```

## Circuit Breaker Stuck Open

### Symptom
Circuit breaker stays open even when service recovers

### Possible Causes

1. **Success threshold too high**
   - Circuit needs more successes to close
   - Service may be intermittently failing

2. **Timeout too short**
   - Circuit tries to close too quickly
   - Service may not be fully recovered

3. **Service still failing**
   - Service may still be experiencing issues
   - Check service health

### Solutions

```typescript
// Lower success threshold
circuitBreaker: {
  failureThreshold: 5,
  successThreshold: 1, // Lower threshold
  timeout: 60000
}

// Increase timeout
circuitBreaker: {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 120000 // Longer timeout
}

// Manually reset circuit breaker (if supported)
circuitBreaker.reset()
```

## Rate Limit Issues

### Symptom
Frequent rate limit errors despite retries

### Possible Causes

1. **Not respecting Retry-After headers**
   - Errors not properly classified
   - Retry-After header not parsed

2. **Rate limit state not tracked**
   - State not shared across requests
   - State not updated from headers

3. **Too many retries**
   - `maxAttempts` too high
   - Retrying too aggressively

### Solutions

```typescript
// Ensure errors are properly classified
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

// Use rate limit state tracking
await retry({
  fn: async () => apiCall(),
  rateLimitState: getRateLimitState(),
  maxAttempts: 3 // Don't retry too many times
})
```

## Timeout Issues

### Symptom
Operations timing out before completing

### Possible Causes

1. **Timeout too low**
   - Operations legitimately take longer
   - Timeout doesn't account for retries

2. **Too many retries**
   - Each retry adds delay
   - Total time exceeds timeout

3. **Service slow**
   - Service may be degraded
   - Check service performance

### Solutions

```typescript
// Increase timeout
await retry({
  fn: async () => slowOperation(),
  timeout: 60000, // 60 seconds
  maxAttempts: 3
})

// Reduce retry attempts
await retry({
  fn: async () => operation(),
  timeout: 30000,
  maxAttempts: 2 // Fewer retries = less total time
})

// Check if timeout accounts for retries
// timeout should be >= (maxAttempts * averageOperationTime)
```

## Memory Issues

### Symptom
High memory usage with many retries

### Possible Causes

1. **Too many retry attempts**
   - Each attempt creates objects
   - High `maxAttempts` multiplies objects

2. **Event handlers retaining references**
   - Event handlers may capture closures
   - Large objects in event handlers

3. **Metrics computation**
   - Metrics computed for all attempts
   - Large attempt arrays

### Solutions

```typescript
// Reduce max attempts
await retry({
  fn: async () => operation(),
  maxAttempts: 3 // Lower limit
})

// Avoid capturing large objects in event handlers
await retry({
  fn: async () => operation(),
  onEvent: (event) => {
    // Don't capture large objects here
    logger.info('retry', { type: event.type })
  }
})
```

## Type Errors

### Symptom
TypeScript errors with RetryAttempt types

### Possible Causes

1. **Using deprecated createRetryAttempt**
   - Should use createRetryAttemptSuccess/Failure
   - Discriminated union requires proper types

2. **Not checking discriminated union**
   - Need to check result/error before access
   - Type narrowing required

### Solutions

```typescript
// Use proper type guards
const attempt = result.attempts[0]
if (attempt.error === null) {
  // TypeScript knows attempt.result exists
  console.log(attempt.result)
} else {
  // TypeScript knows attempt.error exists
  console.log(attempt.error)
}

// Use success/failure helpers
const successAttempt = createRetryAttemptSuccess({
  attempt: 1,
  result: 'data',
  failureDomain: FailureDomain.Unknown,
  delay: 0
})
```

## Performance Issues

### Symptom
Retries causing performance degradation

### Possible Causes

1. **Synchronous event handlers**
   - Slow event handlers block retry loop
   - Heavy computation in handlers

2. **Too many retries**
   - High `maxAttempts` increases latency
   - Each retry adds delay

3. **Inefficient policies**
   - Policies computing expensive delays
   - Complex classification logic

### Solutions

```typescript
// Make event handlers async or fast
await retry({
  fn: async () => operation(),
  onEvent: async (event) => {
    // Async handler doesn't block
    await logToExternalService(event)
  }
})

// Use circuit breaker to fail fast
await retry({
  fn: async () => operation(),
  circuitBreaker: {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 5000 // Fail fast
  }
})
```

## Common Error Messages

### "Circuit breaker is open"
**Meaning**: Circuit breaker has opened due to too many failures.

**Solution**: 
- Check service health
- Wait for timeout period
- Lower failure threshold
- Manually reset if needed

### "Rate limit active"
**Meaning**: Rate limit tracker detected active rate limit.

**Solution**:
- Wait for rate limit to reset
- Check rate limit state
- Reduce request rate
- Use rate limit state tracking

### "Retry exhausted after N attempts"
**Meaning**: All retry attempts failed.

**Solution**:
- Check last error in `RetryExhaustedError.lastError`
- Review failure domain distribution
- Check service health
- Verify error classification

### "Operation cancelled"
**Meaning**: Operation was cancelled via AbortSignal or timeout.

**Solution**:
- Check if timeout is appropriate
- Verify cancellation signal
- Review operation duration
- Increase timeout if needed

## Debugging Tips

### Enable Debug Logging

```typescript
await retry({
  fn: async () => operation(),
  onEvent: (event) => {
    console.debug('Retry event:', {
      type: event.type,
      attempt: event.attempt.attempt,
      elapsedMs: event.elapsedMs,
      failureDomain: event.attempt.failureDomain,
      delay: event.attempt.delay,
      error: event.attempt.error?.message
    })
  }
})
```

### Inspect Metrics

```typescript
const result = await retry({ fn: operation() })

console.log('Retry metrics:', {
  retryRate: result.metrics.retryRate,
  successRate: result.metrics.successRate,
  averageDelay: result.metrics.averageDelay,
  failureDomains: result.metrics.failureDomainDistribution,
  totalRetries: result.metrics.totalRetries
})
```

### Check Circuit Breaker State

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
  onStateChange: (state) => {
    console.log('Circuit breaker state:', state)
  }
})

await retry({
  fn: async () => operation(),
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000
  }
})
```

## Getting Help

If you encounter issues not covered here:

1. Check the [Best Practices](./BEST_PRACTICES.md) guide
2. Review the [Architecture](./ARCHITECTURE.md) documentation
3. Check GitHub issues
4. Review your error logs and metrics
5. Create a minimal reproduction case


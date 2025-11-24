# Production Deployment Guide

Guidelines for deploying rebound in production environments.

## Monitoring

### Key Metrics to Track

1. **Retry Rate**: `result.metrics.retryRate`
   - Alert if > 0.3 (30% of requests retry)
   - Indicates service instability

2. **Success Rate**: `result.metrics.successRate`
   - Alert if < 0.95 (95% success rate)
   - Indicates service degradation

3. **Failure Domain Distribution**: `result.metrics.failureDomainDistribution`
   - Monitor rate limit failures
   - Track transient vs permanent errors

4. **Average Delay**: `result.metrics.averageDelay`
   - Monitor backoff delays
   - High delays indicate rate limiting

### Example Monitoring Setup

```typescript
import { retry, RetryEvent } from 'rebound'

async function monitoredRetry<T>(params: RetryParams<T>): Promise<RetryResult<T>> {
  const startTime = Date.now()
  
  return retry({
    ...params,
    onEvent: (event: RetryEvent<T>) => {
      // Emit to your metrics system
      metrics.timing('retry.delay', event.attempt.delay)
      metrics.increment('retry.attempts', {
        type: event.type,
        domain: event.attempt.failureDomain
      })
      
      // Call original handler if provided
      params.onEvent?.(event)
    }
  }).then(result => {
    // Emit final metrics
    metrics.gauge('retry.rate', result.metrics.retryRate)
    metrics.gauge('retry.success_rate', result.metrics.successRate)
    metrics.timing('retry.duration', result.totalDuration)
    
    return result
  })
}
```

## Logging

### Structured Logging

Use structured logs for better observability:

```typescript
await retry({
  fn: async () => fetchData(),
  onEvent: (event) => {
    logger.info({
      event: 'retry',
      type: event.type,
      attempt: event.attempt.attempt,
      totalAttempts: event.totalAttempts,
      elapsedMs: event.elapsedMs,
      failureDomain: event.attempt.failureDomain,
      delay: event.attempt.delay,
      error: event.attempt.error?.message,
      isLastAttempt: event.isLastAttempt
    })
  }
})
```

### Log Levels

- **DEBUG**: All retry events (development only)
- **INFO**: Retry attempts and successes
- **WARN**: High retry rates, circuit breaker state changes
- **ERROR**: Final failures, exhausted retries

## Alerting

### Alert Conditions

Set up alerts for:

1. **High Retry Rate**
   ```typescript
   if (result.metrics.retryRate > 0.5) {
     alert('High retry rate: 50%+ of requests retrying')
   }
   ```

2. **Circuit Breaker Open**
   ```typescript
   circuitBreaker.onStateChange = (state) => {
     if (state === 'open') {
       alert('Circuit breaker opened - service may be down')
     }
   }
   ```

3. **Rate Limit Exceeded**
   ```typescript
   if (result.metrics.failureDomainDistribution[FailureDomain.RateLimit] > 10) {
     alert('Rate limit exceeded frequently')
   }
   ```

4. **Low Success Rate**
   ```typescript
   if (result.metrics.successRate < 0.9) {
     alert('Success rate below 90%')
   }
   ```

## Performance

### Memory Considerations

- Each retry attempt creates a `RetryAttempt` object
- With `maxAttempts: 5`, expect ~5 objects per retry operation
- Objects are small (~200 bytes each)
- Memory is released after operation completes

### CPU Considerations

- Metrics computation is O(n) where n = number of attempts
- Event callbacks should be fast (consider async if needed)
- Circuit breaker operations are O(1)

### Network Considerations

- Retries increase network traffic
- Use circuit breakers to fail fast when service is down
- Respect rate limits to avoid overwhelming services

## Configuration

### Environment-Based Configuration

```typescript
const retryConfig = {
  maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3'),
  timeout: parseInt(process.env.RETRY_TIMEOUT || '30000'),
  circuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER === 'true' ? {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000
  } : undefined
}

await retry({
  fn: async () => fetchData(),
  ...retryConfig
})
```

### Feature Flags

Use feature flags to control retry behavior:

```typescript
const useCircuitBreaker = featureFlags.isEnabled('circuit-breaker')
const useRateLimitTracking = featureFlags.isEnabled('rate-limit-tracking')

await retry({
  fn: async () => fetchData(),
  circuitBreaker: useCircuitBreaker ? circuitBreakerConfig : undefined,
  rateLimitState: useRateLimitTracking ? rateLimitState : undefined
})
```

## Error Handling

### Graceful Degradation

```typescript
try {
  const result = await retry({
    fn: async () => fetchData(),
    maxAttempts: 3
  })
  return result.value
} catch (error) {
  if (error instanceof RetryExhaustedError) {
    // Return cached data or default value
    return getCachedData() || getDefaultValue()
  }
  throw error
}
```

### Error Aggregation

```typescript
const result = await retry({ fn: fetchData })

if (!result.metrics.successRate) {
  // Aggregate all errors for debugging
  const errors = result.attempts
    .filter(a => a.error !== null)
    .map(a => ({
      attempt: a.attempt,
      error: a.error?.message,
      domain: a.failureDomain
    }))
  
  logger.error('Retry failed', { errors })
}
```

## Security

### Sensitive Data

Don't log sensitive data in error messages:

```typescript
await retry({
  fn: async () => {
    try {
      return await apiCall({ apiKey: secretKey })
    } catch (error) {
      // Remove sensitive data before retrying
      const safeError = new Error('API call failed')
      ;(safeError as any).status = (error as any).status
      throw safeError
    }
  }
})
```

### Rate Limit Abuse

Be careful not to abuse rate limits:

```typescript
// Good: Respect rate limits
await retry({
  fn: async () => apiCall(),
  rateLimitState: getRateLimitState(), // Track state
  maxAttempts: 3 // Don't retry too many times
})
```

## Scaling

### Shared Circuit Breaker State

For distributed systems, share circuit breaker state:

```typescript
// Use Redis or similar for shared state
const sharedCircuitBreaker = new SharedCircuitBreaker({
  key: 'api:external-service',
  failureThreshold: 10, // Higher threshold for shared state
  successThreshold: 5,
  timeout: 60000
})

await retry({
  fn: async () => externalApiCall(),
  circuitBreaker: sharedCircuitBreaker.getOptions()
})
```

### Rate Limit State Sharing

Share rate limit state across instances:

```typescript
const sharedRateLimitState = await redis.get('rate-limit:api')

await retry({
  fn: async () => apiCall(),
  rateLimitState: () => sharedRateLimitState
})

// Update shared state after request
await redis.set('rate-limit:api', updatedState)
```

## Testing in Production

### Canary Deployments

Test retry behavior in canary:

```typescript
if (isCanary()) {
  // More aggressive retry in canary to test behavior
  await retry({
    fn: async () => fetchData(),
    maxAttempts: 5, // Higher than production
    onEvent: (event) => {
      // Log all events in canary
      logger.debug('canary-retry', event)
    }
  })
} else {
  // Production config
  await retry({
    fn: async () => fetchData(),
    maxAttempts: 3
  })
}
```

### A/B Testing Policies

Test different retry policies:

```typescript
const policy = experiment.getVariant('retry-policy') === 'aggressive'
  ? new ExponentialBackoffPolicy(500, 10000, 2) // Faster
  : new RateLimitAwarePolicy() // Standard

await retry({
  fn: async () => fetchData(),
  policy
})
```

## Troubleshooting

### High Retry Rates

1. Check failure domain distribution
2. Verify service health
3. Review timeout settings
4. Check for rate limiting

### Circuit Breaker Stuck Open

1. Check service health
2. Verify failure threshold
3. Review timeout settings
4. Manually reset if needed

### Rate Limit Issues

1. Verify rate limit headers are parsed correctly
2. Check rate limit state tracking
3. Review Retry-After header handling
4. Consider increasing rate limit thresholds

## Rollback Plan

If retry behavior causes issues:

1. **Disable retries**: Set `maxAttempts: 1`
2. **Disable circuit breaker**: Remove `circuitBreaker` option
3. **Increase timeouts**: Give more time before retrying
4. **Reduce retry attempts**: Lower `maxAttempts`

## Checklist

Before deploying to production:

- [ ] Monitoring set up (metrics, logs, alerts)
- [ ] Appropriate timeouts configured
- [ ] Circuit breakers configured for critical dependencies
- [ ] Rate limit tracking enabled for rate-limited APIs
- [ ] Error handling tested
- [ ] Performance tested under load
- [ ] Rollback plan documented
- [ ] Team trained on retry behavior
- [ ] Documentation updated


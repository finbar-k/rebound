# Architecture

This document explains the architectural decisions and design principles behind rebound.

## Core Principles

Rebound is built on the following principles:

1. **Failure Domain Classification** - Different errors require different retry strategies
2. **Pluggable Policies** - Retry behavior is customizable through policy interfaces
3. **Observability First** - Built-in events and metrics for monitoring
4. **Distributed Systems Awareness** - Handles rate limits, circuit breakers, and backpressure
5. **Type Safety** - Full TypeScript support with discriminated unions
6. **RORO Pattern** - All functions receive objects and return objects

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    retry() Function                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Circuit    │  │    Rate      │  │  Timeout &   │  │
│  │   Breaker    │  │   Limit      │  │ Cancellation │  │
│  │              │  │   Tracker    │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Retry Loop                            │  │
│  │  1. Execute function                             │  │
│  │  2. Classify error (FailureClassifier)           │  │
│  │  3. Calculate delay (RetryPolicy)                │  │
│  │  4. Emit event (onEvent)                         │  │
│  │  5. Sleep and retry                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Metrics    │  │    Events    │  │    Result    │  │
│  │  Computation │  │   Emission   │  │   Building   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Design Decisions

### 1. Failure Domains

**Decision**: Use enum-based failure domains instead of simple retry/no-retry flags.

**Rationale**: 
- Different error types require different strategies
- Rate limits need special handling (Retry-After headers)
- Permanent errors should never retry
- Transient errors can retry with backoff
- Unknown errors use conservative strategy

**Alternatives Considered**:
- Simple boolean `shouldRetry` flag
- Error type hierarchy
- Custom classification callbacks

**Chosen Because**: Provides clear, extensible categorization while remaining simple.

### 2. Pluggable Policies

**Decision**: Separate delay calculation into `RetryPolicy` interface.

**Rationale**:
- Different use cases need different backoff strategies
- Allows experimentation without code changes
- Enables A/B testing of retry strategies
- Makes testing easier (mock policies)

**Alternatives Considered**:
- Hardcoded exponential backoff
- Configuration object with strategy enum
- Function-based policies

**Chosen Because**: Provides maximum flexibility while maintaining type safety.

### 3. RORO Pattern

**Decision**: All functions receive objects and return objects.

**Rationale**:
- Easier to extend (add optional parameters)
- Better IDE autocomplete
- Self-documenting (named parameters)
- Consistent API surface

**Alternatives Considered**:
- Traditional positional parameters
- Builder pattern
- Fluent API

**Chosen Because**: Best balance of simplicity and extensibility.

### 4. Discriminated Unions for RetryAttempt

**Decision**: Use discriminated union (`RetryAttemptSuccess | RetryAttemptFailure`) instead of nullable fields.

**Rationale**:
- Type safety: TypeScript knows result/error are mutually exclusive
- Better IDE support
- Prevents invalid states (both result and error)
- Clearer intent

**Alternatives Considered**:
- Nullable result and error fields
- Separate success/failure types
- Optional chaining everywhere

**Chosen Because**: Maximum type safety with minimal runtime overhead.

### 5. Circuit Breaker Integration

**Decision**: Optional circuit breaker, not built-in.

**Rationale**:
- Not all use cases need circuit breakers
- Circuit breaker state should be shared across retry operations
- Allows users to implement their own circuit breaker logic
- Keeps core retry logic simple

**Alternatives Considered**:
- Built-in circuit breaker (always on)
- Separate circuit breaker library dependency
- No circuit breaker support

**Chosen Because**: Provides distributed systems resilience without adding complexity for simple use cases.

### 6. Rate Limit State Tracking

**Decision**: Optional rate limit state tracker with per-endpoint support.

**Rationale**:
- Different endpoints may have different rate limits
- Preemptive backoff prevents hitting rate limits
- State can be shared across requests
- Works with or without state tracking

**Alternatives Considered**:
- Only respect Retry-After headers (reactive)
- Built-in state tracking (always on)
- No rate limit awareness

**Chosen Because**: Enables proactive rate limit handling while remaining optional.

## Component Responsibilities

### Retry Engine (`retry.ts`)
- Orchestrates retry attempts
- Manages timeouts and cancellation
- Integrates circuit breaker and rate limit tracker
- Computes metrics
- Emits events

### Policies (`policies/`)
- Calculate retry delays
- Implement backoff strategies
- Handle failure domain-specific logic

### Classifiers (`classifiers/`)
- Classify errors into failure domains
- Extract error metadata
- Handle HTTP-specific error patterns

### Circuit Breaker (`circuit-breaker.ts`)
- Track failure/success counts
- Manage circuit state (closed/open/half-open)
- Prevent cascading failures

### Rate Limit Tracker (`rate-limit-tracker.ts`)
- Track rate limit state
- Parse rate limit headers
- Enable preemptive backoff

### Metrics (`utils/metrics.ts`)
- Compute retry statistics
- Calculate failure domain distribution
- Aggregate attempt data

## Extension Points

### Custom Policies
Implement `RetryPolicy` interface to create custom backoff strategies.

### Custom Classifiers
Implement `FailureClassifier` interface to classify errors differently.

### Event Handlers
Use `onEvent` callback to integrate with monitoring systems.

### Circuit Breaker
Provide `circuitBreaker` options to enable circuit breaker pattern.

### Rate Limit Tracking
Provide `rateLimitState` to enable proactive rate limit handling.

## Performance Considerations

- **Object Creation**: RetryAttempt objects are created for each attempt (necessary for observability)
- **Event Callbacks**: Synchronous callbacks should be fast (consider async if needed)
- **Metrics Computation**: Computed once at end (not during retry loop)
- **Circuit Breaker**: Minimal overhead when not configured
- **Rate Limit Tracker**: O(1) operations, minimal memory footprint

## Future Considerations

- **Adaptive Policies**: Policies that adjust based on failure patterns
- **Distributed Tracing**: Integration with OpenTelemetry
- **Metrics Export**: Built-in Prometheus/StatsD support
- **Idempotency Keys**: Built-in idempotency key generation and tracking


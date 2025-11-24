# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-XX

### Added

- Initial public release
- Core retry functionality with intelligent failure handling
- Failure domain classification (RateLimit, Transient, Permanent, Unknown)
- Pluggable retry policies (exponential backoff, rate-limit-aware)
- HTTP-aware failure classifier with automatic Retry-After header detection
- Circuit breaker support for preventing cascading failures
- Rate limit state tracking for proactive backoff
- Full AbortSignal support for cancellation
- Timeout support for overall operation time limits
- Observability hooks via `onEvent` callback
- Comprehensive metrics computation (retry rate, success rate, failure domain distribution)
- TypeScript support with full type definitions
- Comprehensive documentation (Architecture, Best Practices, Production Guide, Troubleshooting)

### Features

- **Failure Domain Classification**: Automatically classifies errors into appropriate failure domains
- **Rate Limit Awareness**: Respects `Retry-After` headers from HTTP 429 responses
- **Timeout & Cancellation**: Full `AbortSignal` support for cancellation
- **Observability**: Event hooks for monitoring retry attempts
- **Pluggable Policies**: Custom retry strategies via policy interface
- **Circuit Breaker**: Optional circuit breaker for distributed systems resilience
- **Rate Limit Tracking**: Optional rate limit state tracking for proactive backoff
- **Metrics**: Built-in metrics computation for retry statistics

### Documentation

- README with quick start and advanced usage examples
- Architecture documentation explaining design decisions
- Best practices guide
- Production deployment guide
- Troubleshooting guide


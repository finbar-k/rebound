import type { RetryAttempt, RetryParams, RetryResult } from './types.js'
import { FailureDomain } from './types.js'
import { RateLimitAwarePolicy } from './policies/index.js'
import { HttpFailureClassifier } from './classifiers/index.js'
import { DEFAULT_MAX_ATTEMPTS } from './constants.js'
import { RetryCancelledError, RetryExhaustedError } from './errors.js'
import { validateRetryOptions } from './validation.js'
import { CircuitBreaker } from './circuit-breaker.js'
import { RateLimitTracker } from './rate-limit-tracker.js'
import { combineSignals, sleep, setupTimeout, cleanup } from './retry/helpers.js'
import { createRetryEvent, emitEvent } from './retry/event-emitter.js'
import { executeAttempt } from './retry/attempt-handler.js'
import { performPreChecks } from './retry/pre-checks.js'
import { buildSuccessResult } from './retry/result-builders.js'
import { createRetryAttemptFailure } from './utils.js'

/**
 * Main retry function with intelligent failure handling
 */
export async function retry<T>(params: RetryParams<T>): Promise<RetryResult<T>> {
  const {
    fn,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    policy = new RateLimitAwarePolicy(),
    classifier = new HttpFailureClassifier(),
    signal,
    timeout,
    idempotent: _idempotent = false,
    onEvent,
    circuitBreaker: circuitBreakerOptions,
    rateLimitState,
  } = params

  // Validate options
  validateRetryOptions({ maxAttempts, timeout })

  const attempts: RetryAttempt<T>[] = []

  // Initialize circuit breaker if configured
  const circuitBreaker = circuitBreakerOptions
    ? new CircuitBreaker(circuitBreakerOptions)
    : null

  // Initialize rate limit tracker if configured
  const rateLimitTracker = rateLimitState
    ? new RateLimitTracker({ initialState: rateLimitState })
    : null

  // Setup timeout if specified
  const { controller: timeoutController, timeoutId } = setupTimeout(timeout)

  const { signal: combinedSignal, cleanup: cleanupSignals } = combineSignals(
    signal,
    timeoutController?.signal
  )

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Perform pre-attempt checks
      const preCheck = performPreChecks<T>({
        attempt,
        combinedSignal,
        circuitBreaker,
        rateLimitTracker,
      })

      // Handle pre-check failures (cancellation, circuit breaker)
      if (!preCheck.shouldProceed && preCheck.attemptRecord) {
        attempts.push(preCheck.attemptRecord)

        emitEvent(
          onEvent,
          createRetryEvent({
            type: preCheck.attemptRecord.error ? 'failure' : 'cancelled',
            attempt: preCheck.attemptRecord,
            totalAttempts: attempts.length,
            isLastAttempt: attempt === maxAttempts,
          })
        )

        cleanup(timeoutId, cleanupSignals)

        const error = preCheck.attemptRecord.error
        if (error) throw error
        throw new RetryCancelledError()
      }

      // Handle rate limit wait
      if (preCheck.delay && preCheck.delay > 0 && preCheck.attemptRecord) {
        attempts.push(preCheck.attemptRecord)

        emitEvent(
          onEvent,
          createRetryEvent({
            type: 'attempt',
            attempt: preCheck.attemptRecord,
            totalAttempts: attempts.length,
            estimatedRemainingMs: preCheck.delay,
            isLastAttempt: attempt === maxAttempts,
          })
        )

        await sleep(preCheck.delay, combinedSignal)
        continue
      }

      // Execute attempt
      const attemptResult = await executeAttempt({
        fn,
        attempt,
        classifier,
        policy,
        circuitBreaker,
        rateLimitTracker,
      })

      attempts.push(attemptResult.attemptRecord)

      // Handle success
      if (attemptResult.success && attemptResult.result !== undefined) {
        emitEvent(
          onEvent,
          createRetryEvent({
            type: 'success',
            attempt: attemptResult.attemptRecord,
            totalAttempts: attempts.length,
            isLastAttempt: true,
          })
        )

        cleanup(timeoutId, cleanupSignals)

        return buildSuccessResult(attemptResult.result, attempts)
      }

      // Handle failure
      const isLastAttempt = attempt === maxAttempts
      const estimatedRemainingMs =
        attemptResult.delay !== null && !isLastAttempt
          ? attemptResult.delay
          : undefined

      // Emit attempt event for retry
      emitEvent(
        onEvent,
        createRetryEvent({
          type: 'attempt',
          attempt: attemptResult.attemptRecord,
          totalAttempts: attempts.length,
          estimatedRemainingMs,
          isLastAttempt,
        })
      )

      // If permanent error or no delay, fail immediately
      if (
        attemptResult.failureDomain === FailureDomain.Permanent ||
        attemptResult.delay === null
      ) {
        emitEvent(
          onEvent,
          createRetryEvent({
            type: 'failure',
            attempt: attemptResult.attemptRecord,
            totalAttempts: attempts.length,
            isLastAttempt: true,
          })
        )

        cleanup(timeoutId, cleanupSignals)

        if (attemptResult.error) {
          throw attemptResult.error
        }
        throw new Error('Unknown error')
      }

      // Last attempt - fail
      if (isLastAttempt) {
        emitEvent(
          onEvent,
          createRetryEvent({
            type: 'failure',
            attempt: attemptResult.attemptRecord,
            totalAttempts: attempts.length,
            isLastAttempt: true,
          })
        )

        cleanup(timeoutId, cleanupSignals)

        throw new RetryExhaustedError(
          maxAttempts,
          attemptResult.error,
          attemptResult.failureDomain
        )
      }

      // Wait before retrying (with cancellation support)
      try {
        await sleep(attemptResult.delay, combinedSignal)
      } catch (sleepError) {
        // Sleep was cancelled
        const cancelledError =
          sleepError instanceof Error ? sleepError : new RetryCancelledError()
        const cancelledAttempt = createRetryAttemptFailure<T>({
          attempt,
          error: cancelledError,
          failureDomain: FailureDomain.Unknown,
          delay: 0,
        })
        attempts.push(cancelledAttempt)

        emitEvent(
          onEvent,
          createRetryEvent({
            type: 'cancelled',
            attempt: cancelledAttempt,
            totalAttempts: attempts.length,
            isLastAttempt: attempt === maxAttempts,
          })
        )

        cleanup(timeoutId, cleanupSignals)
        throw cancelledError
      }
    }

    // Should never reach here, but TypeScript needs it
    cleanup(timeoutId, cleanupSignals)
    throw new RetryExhaustedError(maxAttempts, undefined, undefined)
  } finally {
    cleanup(timeoutId, cleanupSignals)
  }
}

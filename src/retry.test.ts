/**
 * Test suite for retry functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retry, RetryCancelledError, RetryExhaustedError, createHttpError } from './index.js'
import type { RetryEvent } from './types.js'
import { ExponentialBackoffPolicy } from './policies/exponential.js'
import { RetryConfigurationError } from './errors.js'

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const promise = retry({ fn })
    
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.value).toBe('success')
    expect(result.attempts.length).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success')

    const promise = retry({ fn, maxAttempts: 3 })
    
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.value).toBe('success')
    expect(result.attempts.length).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should respect maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))

    const promise = retry({ fn, maxAttempts: 3 })
    
    // Advance timers to allow retries to complete
    await vi.runAllTimersAsync()
    
    try {
      await promise
      expect.fail('Should have thrown RetryExhaustedError')
    } catch (error) {
      expect(error).toBeInstanceOf(RetryExhaustedError)
    }
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should classify HTTP errors correctly', async () => {
    const rateLimitError = createHttpError({ message: 'Rate limited', metadata: { status: 429 } })

    const fn = vi.fn().mockRejectedValue(rateLimitError)

    const promise = retry({ fn, maxAttempts: 2 })
    
    // Advance timers to allow retries to complete
    await vi.runAllTimersAsync()
    
    try {
      await promise
      expect.fail('Should have thrown error')
    } catch (error) {
      expect((error as Error).message).toContain('Rate limited')
    }
    expect(fn).toHaveBeenCalled()
  })

  it('should support cancellation', async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    const promise = retry({
      fn,
      signal: controller.signal,
      maxAttempts: 10,
    })

    controller.abort()

    await expect(promise).rejects.toThrow(RetryCancelledError)
  })

  it('should support timeout', async () => {
    // Function that rejects after delay (allows retry loop to continue)
    const fn = vi.fn().mockImplementation(
      () => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout test')), 500)
      })
    )

    const promise = retry({
      fn,
      timeout: 1000,
      maxAttempts: 10,
    })

    // Advance timers to trigger the timeout (before second attempt)
    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toThrow(RetryCancelledError)
  })

  it('should emit events', async () => {
    const onEvent = vi.fn()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success')

    const promise = retry({
      fn,
      maxAttempts: 3,
      onEvent,
    })

    await vi.runAllTimersAsync()
    await promise

    expect(onEvent).toHaveBeenCalled()
    const events: RetryEvent<unknown>[] = onEvent.mock.calls.map((call: unknown[]) => call[0] as RetryEvent<unknown>)
    expect(events.some((e) => e.type === 'attempt')).toBe(true)
    expect(events.some((e) => e.type === 'success')).toBe(true)
  })

  it('should not retry permanent errors', async () => {
    const permanentError = createHttpError({ message: 'Bad request', metadata: { status: 400 } })

    const fn = vi.fn().mockRejectedValue(permanentError)

    const promise = retry({ fn, maxAttempts: 5 })
    await vi.runAllTimersAsync()
    
    try {
      await promise
      expect.fail('Should have thrown error')
    } catch (error) {
      expect((error as Error).message).toContain('Bad request')
    }
    expect(fn).toHaveBeenCalledTimes(1) // Should not retry
  })

  it('should handle non-Error throws', async () => {
    const fn = vi.fn().mockRejectedValue('string error')

    const promise = retry({ fn, maxAttempts: 2 })
    await vi.runAllTimersAsync()
    
    try {
      await promise
      expect.fail('Should have thrown error')
    } catch (error) {
      // Error should be thrown
    }
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should validate policy constructor parameters', () => {
    expect(() => {
      new ExponentialBackoffPolicy(-1)
    }).toThrow(RetryConfigurationError)

    expect(() => {
      new ExponentialBackoffPolicy(1000, 500) // maxDelay < baseDelay
    }).toThrow(RetryConfigurationError)

    expect(() => {
      new ExponentialBackoffPolicy(1000, 5000, 0) // multiplier <= 0
    }).toThrow(RetryConfigurationError)
  })

  it('should include lastError in RetryExhaustedError', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('test error'))

    const promise = retry({ fn, maxAttempts: 2 })
    await vi.runAllTimersAsync()
    
    try {
      await promise
    } catch (error) {
      expect(error).toBeInstanceOf(RetryExhaustedError)
      expect((error as RetryExhaustedError).lastError).toBeDefined()
      expect((error as RetryExhaustedError).lastError?.message).toBe('test error')
      expect((error as RetryExhaustedError).attempts).toBe(2)
    }
  })
})


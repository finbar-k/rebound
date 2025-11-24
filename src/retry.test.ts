/**
 * Test suite for retry functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { retry, RetryCancelledError, RetryExhaustedError, createHttpError } from './index.js'
import type { RetryEvent } from './types.js'
import { ExponentialBackoffPolicy } from './policies/exponential.js'
import { RetryConfigurationError } from './errors.js'

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await retry({ fn })

    expect(result.value).toBe('success')
    expect(result.attempts.length).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success')

    const result = await retry({ fn, maxAttempts: 3 })

    expect(result.value).toBe('success')
    expect(result.attempts.length).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should respect maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))

    await expect(retry({ fn, maxAttempts: 3 })).rejects.toThrow(RetryExhaustedError)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should classify HTTP errors correctly', async () => {
    const rateLimitError = createHttpError({ message: 'Rate limited', metadata: { status: 429 } })

    const fn = vi.fn().mockRejectedValue(rateLimitError)

    await expect(retry({ fn, maxAttempts: 2 })).rejects.toThrow('Rate limited')
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
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 10000))
    )

    const promise = retry({
      fn,
      timeout: 1000,
      maxAttempts: 10,
    })

    vi.advanceTimersByTime(1000)

    await expect(promise).rejects.toThrow(RetryCancelledError)
  })

  it('should emit events', async () => {
    const onEvent = vi.fn()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success')

    await retry({
      fn,
      maxAttempts: 3,
      onEvent,
    })

    expect(onEvent).toHaveBeenCalled()
    const events: RetryEvent<unknown>[] = onEvent.mock.calls.map((call: unknown[]) => call[0] as RetryEvent<unknown>)
    expect(events.some((e) => e.type === 'attempt')).toBe(true)
    expect(events.some((e) => e.type === 'success')).toBe(true)
  })

  it('should not retry permanent errors', async () => {
    const permanentError = createHttpError({ message: 'Bad request', metadata: { status: 400 } })

    const fn = vi.fn().mockRejectedValue(permanentError)

    await expect(retry({ fn, maxAttempts: 5 })).rejects.toThrow('Bad request')
    expect(fn).toHaveBeenCalledTimes(1) // Should not retry
  })

  it('should handle non-Error throws', async () => {
    const fn = vi.fn().mockRejectedValue('string error')

    await expect(retry({ fn, maxAttempts: 2 })).rejects.toThrow()
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

    try {
      await retry({ fn, maxAttempts: 2 })
    } catch (error) {
      expect(error).toBeInstanceOf(RetryExhaustedError)
      expect((error as RetryExhaustedError).lastError).toBeDefined()
      expect((error as RetryExhaustedError).lastError?.message).toBe('test error')
      expect((error as RetryExhaustedError).attempts).toBe(2)
    }
  })
})


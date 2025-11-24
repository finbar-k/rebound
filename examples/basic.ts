/**
 * Basic usage examples for rebound
 */

import { retry, FailureDomain, createHttpError } from '../src/index.js'

// Example 1: Simple retry with default settings
async function example1() {
  const result = await retry({
    fn: async () => {
      const response = await fetch('https://api.example.com/data')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response.json()
    },
  })

  console.log('Result:', result.value)
  console.log('Attempts:', result.attempts.length)
  console.log('Metrics:', result.metrics)
}

// Example 2: With observability
async function example2() {
  await retry({
    fn: async () => {
      // Your async operation
      return await Promise.resolve('success')
    },
    maxAttempts: 5,
    onEvent: (event) => {
      console.log(`[${event.type}] Attempt ${event.attempt.attempt}`)
      if (event.attempt.error) {
        console.log(`  Error: ${event.attempt.error.message}`)
        console.log(`  Domain: ${event.attempt.failureDomain}`)
      }
      if (event.attempt.delay > 0) {
        console.log(`  Next retry in: ${event.attempt.delay}ms`)
      }
    },
  })
}

// Example 3: With cancellation
async function example3() {
  const controller = new AbortController()

  // Cancel after 5 seconds
  setTimeout(() => controller.abort(), 5000)

  try {
    await retry({
      fn: async () => {
        // Long-running operation
        await new Promise((resolve) => setTimeout(resolve, 10000))
        return 'done'
      },
      signal: controller.signal,
      maxAttempts: 10,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Operation cancelled') {
      console.log('Operation was cancelled')
    }
  }
}

// Example 4: With timeout
async function example4() {
  try {
    await retry({
      fn: async () => {
        // Operation that might hang
        return await fetch('https://slow-api.example.com/data').then((r) =>
          r.json()
        )
      },
      timeout: 10000, // 10 second overall timeout
      maxAttempts: 5,
    })
  } catch (error) {
    console.error('Operation timed out or failed:', error)
  }
}

// Example 5: Handling rate limits
async function example5() {
  await retry({
    fn: async () => {
      const response = await fetch('https://api.example.com/data')
      
      if (response.status === 429) {
        throw createHttpError({
          message: 'Rate limited',
          metadata: {
            status: 429,
            headers: {
              'retry-after': response.headers.get('retry-after') || '60',
            },
          },
        })
      }
      
      return response.json()
    },
    maxAttempts: 5,
    onEvent: (event) => {
      if (event.attempt.failureDomain === FailureDomain.RateLimit) {
        console.log('Rate limited, respecting Retry-After header')
      }
    },
  })
}


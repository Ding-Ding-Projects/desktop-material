import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  installSameOriginFilter,
  sanitizeCrossOriginRequestHeaders,
} from '../../src/main-process/same-origin-filter'
import type { OrderedWebRequest } from '../../src/main-process/ordered-webrequest'

class TestAsyncEvent<TDetails, TResponse> {
  private listener: ((details: TDetails) => Promise<TResponse>) | null = null

  public addEventListener(
    listener: (details: TDetails) => Promise<TResponse>
  ): void {
    this.listener = listener
  }

  public async dispatch(details: TDetails): Promise<TResponse> {
    assert(this.listener !== null)
    return await this.listener(details)
  }
}

class TestSyncEvent<TDetails> {
  private listener: ((details: TDetails) => void) | null = null

  public addEventListener(listener: (details: TDetails) => void): void {
    this.listener = listener
  }

  public dispatch(details: TDetails): void {
    assert(this.listener !== null)
    this.listener(details)
  }
}

class TestOrderedWebRequest {
  public readonly onBeforeRequest = new TestAsyncEvent<
    { readonly id: number; readonly url: string },
    object
  >()
  public readonly onBeforeSendHeaders = new TestAsyncEvent<
    {
      readonly id: number
      readonly url: string
      readonly requestHeaders: Record<string, string>
    },
    { readonly requestHeaders?: Record<string, string> }
  >()
  public readonly onCompleted = new TestSyncEvent<{ readonly id: number }>()
  public readonly onErrorOccurred = new TestSyncEvent<{
    readonly id: number
  }>()
}

describe('sanitizeCrossOriginRequestHeaders', () => {
  it('removes credentials from a cross-origin redirect', () => {
    assert.deepEqual(
      sanitizeCrossOriginRequestHeaders(
        'https://api.github.com',
        'https://signed-results.example.test/job.txt',
        {
          Authorization: 'Bearer secret',
          authentication: 'private',
          COOKIE: 'session=secret',
          Accept: 'text/plain',
          'User-Agent': 'Desktop Material',
        }
      ),
      {
        Accept: 'text/plain',
        'User-Agent': 'Desktop Material',
      }
    )
  })

  it('preserves request headers on the original origin', () => {
    const headers = {
      Authorization: 'Bearer secret',
      Cookie: 'session=secret',
      Accept: 'application/json',
    }

    assert.deepEqual(
      sanitizeCrossOriginRequestHeaders(
        'https://api.github.com',
        'https://api.github.com/repos/owner/repo/actions/jobs/7/logs',
        headers
      ),
      headers
    )
  })
})

describe('installSameOriginFilter', () => {
  it('releases retained request origins when a request fails', async () => {
    const events = new TestOrderedWebRequest()
    installSameOriginFilter(events as unknown as OrderedWebRequest)

    await events.onBeforeRequest.dispatch({
      id: 7,
      url: 'https://failed.example.test/request',
    })
    events.onErrorOccurred.dispatch({ id: 7 })

    await events.onBeforeRequest.dispatch({
      id: 7,
      url: 'https://api.github.com/repos/owner/repository',
    })
    const headers = { Authorization: 'Bearer current-token' }
    const response = await events.onBeforeSendHeaders.dispatch({
      id: 7,
      url: 'https://api.github.com/repos/owner/repository',
      requestHeaders: headers,
    })

    assert.deepEqual(response.requestHeaders, headers)
  })
})

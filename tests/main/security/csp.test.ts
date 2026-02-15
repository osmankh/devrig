import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockApp, mockSession } = vi.hoisted(() => {
  const mockOnHeadersReceived = vi.fn()
  return {
    mockApp: { isPackaged: false },
    mockSession: {
      defaultSession: {
        webRequest: {
          onHeadersReceived: mockOnHeadersReceived
        }
      }
    }
  }
})

vi.mock('electron', () => ({
  app: mockApp,
  session: mockSession
}))

import { enforceCSP } from '../../../src/main/csp'

describe('CSP enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers an onHeadersReceived handler', () => {
    enforceCSP()
    expect(mockSession.defaultSession.webRequest.onHeadersReceived).toHaveBeenCalledWith(
      expect.any(Function)
    )
  })

  describe('development mode (app.isPackaged = false)', () => {
    beforeEach(() => {
      mockApp.isPackaged = false
    })

    it('applies dev CSP with unsafe-eval for HMR', () => {
      enforceCSP()

      const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
      const callback = vi.fn()

      handler({ responseHeaders: { 'X-Existing': ['value'] } }, callback)

      const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
      expect(csp).toContain("'unsafe-eval'")
    })

    it('allows WebSocket connections to localhost for HMR', () => {
      enforceCSP()

      const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
      const callback = vi.fn()
      handler({ responseHeaders: {} }, callback)

      const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
      expect(csp).toContain('ws://localhost:*')
      expect(csp).toContain('http://localhost:*')
    })

    it('still blocks frames and objects', () => {
      enforceCSP()

      const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
      const callback = vi.fn()
      handler({ responseHeaders: {} }, callback)

      const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("object-src 'none'")
    })
  })

  describe('production mode (app.isPackaged = true)', () => {
    beforeEach(() => {
      mockApp.isPackaged = true
    })

    it('applies strict production CSP without unsafe-eval', () => {
      enforceCSP()

      const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
      const callback = vi.fn()
      handler({ responseHeaders: {} }, callback)

      const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
      expect(csp).not.toContain("'unsafe-eval'")
    })

    it('restricts connect-src to self only', () => {
      enforceCSP()

      const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
      const callback = vi.fn()
      handler({ responseHeaders: {} }, callback)

      const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
      expect(csp).toContain("connect-src 'self'")
      expect(csp).not.toContain('ws://localhost')
    })

    it('blocks frames, objects, base-uri, and form-action', () => {
      enforceCSP()

      const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
      const callback = vi.fn()
      handler({ responseHeaders: {} }, callback)

      const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("base-uri 'none'")
      expect(csp).toContain("form-action 'none'")
    })

    it('allows self and data: for images', () => {
      enforceCSP()

      const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
      const callback = vi.fn()
      handler({ responseHeaders: {} }, callback)

      const csp = callback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0]
      expect(csp).toContain("img-src 'self' data: https:")
    })
  })

  it('preserves existing response headers', () => {
    mockApp.isPackaged = true
    enforceCSP()

    const handler = mockSession.defaultSession.webRequest.onHeadersReceived.mock.calls[0][0]
    const callback = vi.fn()

    handler(
      { responseHeaders: { 'X-Custom': ['custom-value'], 'X-Other': ['other'] } },
      callback
    )

    const headers = callback.mock.calls[0][0].responseHeaders
    expect(headers['X-Custom']).toEqual(['custom-value'])
    expect(headers['X-Other']).toEqual(['other'])
    expect(headers['Content-Security-Policy']).toBeDefined()
  })
})

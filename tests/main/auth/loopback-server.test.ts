import { describe, it, expect, afterEach } from 'vitest'
import { startLoopbackServer } from '../../../src/main/auth/loopback-server'
import http from 'http'

// Helper to make an HTTP request to the loopback server
function makeRequest(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode!, body }))
    })
    req.on('error', reject)
  })
}

describe('loopback-server', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  describe('startLoopbackServer', () => {
    it('starts a server on a random port', async () => {
      const result = await startLoopbackServer()
      cleanup = result.close

      expect(result.port).toBeGreaterThan(0)
      expect(typeof result.waitForCallback).toBe('function')
      expect(typeof result.close).toBe('function')
    })

    it('uses a different port on each invocation', async () => {
      const result1 = await startLoopbackServer()
      const result2 = await startLoopbackServer()
      cleanup = () => {
        result1.close()
        result2.close()
      }

      expect(result1.port).not.toBe(result2.port)
    })

    it('returns 200 with success HTML on valid callback (code + state)', async () => {
      const result = await startLoopbackServer()
      cleanup = result.close

      const callbackPromise = result.waitForCallback()
      const response = await makeRequest(result.port, '/?code=abc123&state=xyz789')

      expect(response.status).toBe(200)
      expect(response.body).toContain('Authentication successful')

      const cbResult = await callbackPromise
      expect(cbResult.code).toBe('abc123')
      expect(cbResult.state).toBe('xyz789')
    })

    it('returns 400 when code is missing', async () => {
      const result = await startLoopbackServer()
      cleanup = result.close

      const response = await makeRequest(result.port, '/?state=xyz789')
      expect(response.status).toBe(400)
      expect(response.body).toContain('Missing code or state parameter')
    })

    it('returns 400 when state is missing', async () => {
      const result = await startLoopbackServer()
      cleanup = result.close

      const response = await makeRequest(result.port, '/?code=abc123')
      expect(response.status).toBe(400)
      expect(response.body).toContain('Missing code or state parameter')
    })

    it('returns 400 when both code and state are missing', async () => {
      const result = await startLoopbackServer()
      cleanup = result.close

      const response = await makeRequest(result.port, '/')
      expect(response.status).toBe(400)
    })

    it('resolves waitForCallback with extracted code and state', async () => {
      const result = await startLoopbackServer()
      cleanup = result.close

      const callbackPromise = result.waitForCallback()

      // Simulate browser redirect
      await makeRequest(result.port, '/?code=auth-code-42&state=csrf-token-99')

      const { code, state } = await callbackPromise
      expect(code).toBe('auth-code-42')
      expect(state).toBe('csrf-token-99')
    })

    it('close() shuts down the server', async () => {
      const result = await startLoopbackServer()
      result.close()
      cleanup = null

      // Server should no longer accept connections
      await expect(
        makeRequest(result.port, '/')
      ).rejects.toThrow()
    })
  })
})

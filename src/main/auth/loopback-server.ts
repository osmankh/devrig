import { createServer, type Server } from 'http'
import { URL } from 'url'

interface LoopbackResult {
  port: number
  waitForCallback: () => Promise<{ code: string; state: string }>
  close: () => void
}

export function startLoopbackServer(): Promise<LoopbackResult> {
  return new Promise((resolve, reject) => {
    let callbackResolve: ((value: { code: string; state: string }) => void) | null = null
    let callbackReject: ((reason: Error) => void) | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const server: Server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1`)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        if (code && state) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(
            '<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
            '<div style="text-align:center"><h2>Authentication successful!</h2><p>You can close this tab.</p></div>' +
            '</body></html>'
          )
          callbackResolve?.({ code, state })
          cleanup()
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing code or state parameter')
        }
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal error')
      }
    })

    function cleanup(): void {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
      server.close()
    }

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }

      // 2-minute timeout auto-cleanup
      timeoutHandle = setTimeout(() => {
        callbackReject?.(new Error('OAuth callback timed out'))
        cleanup()
      }, 2 * 60 * 1000)

      resolve({
        port: addr.port,
        waitForCallback: () =>
          new Promise<{ code: string; state: string }>((res, rej) => {
            callbackResolve = res
            callbackReject = rej
          }),
        close: cleanup
      })
    })

    server.on('error', (err) => {
      reject(err)
    })
  })
}

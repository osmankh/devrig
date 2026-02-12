export interface HttpRequestInput {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

export interface HttpRequestOutput {
  status: number
  headers: Record<string, string>
  body: string
}

/**
 * SSRF protection: blocks requests to private/internal IP ranges.
 * Prevents flow executor HTTP actions from reaching internal services
 * or cloud metadata endpoints (e.g., 169.254.169.254).
 */
function isPrivateOrReservedIP(hostname: string): boolean {
  // Block cloud metadata endpoints by hostname
  if (hostname === 'metadata.google.internal' || hostname === 'metadata.internal') {
    return true
  }

  // Handle IPv6-mapped IPv4 (::ffff:x.x.x.x)
  const ipv4Match = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  const effectiveHost = ipv4Match ? ipv4Match[1] : hostname

  // IPv4 private/reserved ranges
  const parts = effectiveHost.split('.')
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const octets = parts.map(Number)
    const [a, b] = octets

    if (a === 127) return true                                 // 127.0.0.0/8 loopback
    if (a === 10) return true                                  // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true           // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true                    // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true                    // 169.254.0.0/16 link-local / cloud metadata
    if (a === 0) return true                                   // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true          // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true       // 198.18.0.0/15 benchmarking
  }

  // IPv6 private/reserved
  const lower = effectiveHost.toLowerCase()
  if (lower === '::1') return true                             // IPv6 loopback
  if (lower.startsWith('fd') || lower.startsWith('fc')) return true  // fd00::/8, fc00::/7 ULA
  if (lower.startsWith('fe80')) return true                    // fe80::/10 link-local

  return false
}

/**
 * Validates URL is not targeting internal/private resources.
 */
function validateUrl(urlString: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return 'Invalid URL'
  }

  // Only allow http(s) protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Protocol "${parsed.protocol}" not allowed — only http: and https:`
  }

  // Strip brackets from IPv6 hostnames
  const hostname = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '')

  if (!hostname) {
    return 'Empty hostname'
  }

  if (hostname === 'localhost') {
    return 'Requests to localhost are blocked'
  }

  if (isPrivateOrReservedIP(hostname)) {
    return `Requests to private/internal IP "${hostname}" are blocked`
  }

  return null // valid
}

export async function executeHttp(config: HttpRequestInput): Promise<{ success: boolean; output: HttpRequestOutput }> {
  const timeout = config.timeout ?? 30_000

  // Security: block SSRF to internal/private networks
  const validationError = validateUrl(config.url)
  if (validationError) {
    console.warn(`[http-executor] Blocked request: ${validationError}`)
    return {
      success: false,
      output: {
        status: 0,
        headers: {},
        body: `Security: ${validationError}`,
      },
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.method !== 'GET' ? config.body : undefined,
      signal: controller.signal,
      redirect: 'manual', // Security: don't auto-follow redirects (could redirect to internal IPs)
    })

    // Security: if redirect, validate the redirect target too
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location) {
        const redirectError = validateUrl(location)
        if (redirectError) {
          console.warn(`[http-executor] Blocked redirect: ${redirectError}`)
          return {
            success: false,
            output: {
              status: response.status,
              headers: {},
              body: `Security: Redirect blocked — ${redirectError}`,
            },
          }
        }
      }
    }

    const body = await response.text()
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      success: response.ok,
      output: {
        status: response.status,
        headers,
        body,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown HTTP error'
    return {
      success: false,
      output: {
        status: 0,
        headers: {},
        body: message,
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

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

export async function executeHttp(config: HttpRequestInput): Promise<{ success: boolean; output: HttpRequestOutput }> {
  const timeout = config.timeout ?? 30_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.method !== 'GET' ? config.body : undefined,
      signal: controller.signal,
    })

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

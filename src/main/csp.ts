import { app, session } from 'electron'

const CSP_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/**
 * Development CSP: relaxes connect-src and script-src to allow
 * webpack-dev-server HMR (WebSocket + localhost).
 * Security: CSP is always enforced — dev mode only adds HMR exceptions.
 */
const CSP_POLICY_DEV = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // HMR requires eval, Vite React plugin requires inline preamble
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:* http://localhost:*",  // HMR WebSocket + dev server
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

export function enforceCSP(): void {
  // Security: CSP is enforced in ALL modes — dev mode uses a relaxed policy
  // that only permits localhost HMR connections
  const policy = app.isPackaged ? CSP_POLICY : CSP_POLICY_DEV

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

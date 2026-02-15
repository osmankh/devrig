import { describe, it, expect } from 'vitest'
import { generateCodeVerifier, generateCodeChallenge } from '../../../src/main/auth/pkce'
import { createHash } from 'crypto'

describe('PKCE', () => {
  describe('generateCodeVerifier', () => {
    it('returns a base64url-encoded string', () => {
      const verifier = generateCodeVerifier()
      // base64url contains only [A-Za-z0-9_-] — no +, /, or = padding
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('returns a 43-character string (32 bytes → base64url)', () => {
      const verifier = generateCodeVerifier()
      // 32 bytes → ceil(32*4/3) = 43 base64url chars (no padding)
      expect(verifier).toHaveLength(43)
    })

    it('generates unique verifiers on each call', () => {
      const a = generateCodeVerifier()
      const b = generateCodeVerifier()
      expect(a).not.toBe(b)
    })
  })

  describe('generateCodeChallenge', () => {
    it('returns a base64url-encoded SHA-256 hash', () => {
      const challenge = generateCodeChallenge('test-verifier')
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('produces the correct SHA-256 digest of the verifier', () => {
      const verifier = 'known-test-verifier-string'
      const expected = createHash('sha256').update(verifier).digest('base64url')
      expect(generateCodeChallenge(verifier)).toBe(expected)
    })

    it('is deterministic — same verifier always produces same challenge', () => {
      const verifier = generateCodeVerifier()
      const c1 = generateCodeChallenge(verifier)
      const c2 = generateCodeChallenge(verifier)
      expect(c1).toBe(c2)
    })

    it('produces different challenges for different verifiers', () => {
      const c1 = generateCodeChallenge('verifier-aaa')
      const c2 = generateCodeChallenge('verifier-bbb')
      expect(c1).not.toBe(c2)
    })

    it('returns a 43-character string (SHA-256 = 32 bytes → base64url)', () => {
      const challenge = generateCodeChallenge('any-verifier')
      expect(challenge).toHaveLength(43)
    })
  })

  describe('end-to-end PKCE flow', () => {
    it('verifier → challenge is a valid S256 code_challenge', () => {
      const verifier = generateCodeVerifier()
      const challenge = generateCodeChallenge(verifier)

      // Server-side verification: hash the verifier and compare to challenge
      const serverSideHash = createHash('sha256').update(verifier).digest('base64url')
      expect(serverSideHash).toBe(challenge)
    })
  })
})

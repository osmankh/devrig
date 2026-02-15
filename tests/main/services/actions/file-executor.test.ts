import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
}))

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
}))

import { executeFileRead } from '../../../../src/main/services/actions/file-executor'
import { readFile, stat, realpath } from 'node:fs/promises'
import { app } from 'electron'
import { tmpdir } from 'node:os'
import { resolve, normalize } from 'node:path'

const mockedReadFile = vi.mocked(readFile)
const mockedStat = vi.mocked(stat)
const mockedRealpath = vi.mocked(realpath)
const mockedGetPath = vi.mocked(app.getPath)

describe('file-executor', () => {
  const userDataDir = '/mock/userData'
  const tempDir = normalize(resolve(tmpdir()))

  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetPath.mockReturnValue(userDataDir)

    // Default: realpath returns the same path
    mockedRealpath.mockImplementation(async (p) => String(p))
  })

  describe('path validation — security', () => {
    it('blocks path traversal with ..', async () => {
      const result = await executeFileRead({ path: `${userDataDir}/../../../etc/passwd` })
      expect(result.success).toBe(false)
      expect(result.output.content).toContain('traversal')
    })

    it('blocks paths outside allowed directories', async () => {
      const result = await executeFileRead({ path: '/etc/passwd' })
      expect(result.success).toBe(false)
      expect(result.output.content).toContain('outside allowed directories')
    })

    it('blocks symlink escapes', async () => {
      // Symlink resolves to a path outside allowed dirs
      mockedRealpath.mockResolvedValue('/etc/shadow')

      const result = await executeFileRead({ path: `${userDataDir}/sneaky-link` })
      expect(result.success).toBe(false)
      expect(result.output.content).toContain('outside allowed directories')
    })

    it('allows reads from userData directory', async () => {
      const filePath = `${userDataDir}/config.json`
      mockedRealpath.mockResolvedValue(normalize(resolve(filePath)))
      mockedReadFile.mockResolvedValue('{"key":"value"}' as any)
      mockedStat.mockResolvedValue({ size: 15 } as any)

      const result = await executeFileRead({ path: filePath })
      expect(result.success).toBe(true)
      expect(result.output.content).toBe('{"key":"value"}')
    })

    it('allows reads from temp directory', async () => {
      const filePath = `${tempDir}/devrig-temp.txt`
      mockedRealpath.mockResolvedValue(normalize(resolve(filePath)))
      mockedReadFile.mockResolvedValue('temp data' as any)
      mockedStat.mockResolvedValue({ size: 9 } as any)

      const result = await executeFileRead({ path: filePath })
      expect(result.success).toBe(true)
      expect(result.output.content).toBe('temp data')
    })

    it('allows reads from custom allowedDirs', async () => {
      const customDir = '/custom/allowed'
      const filePath = `${customDir}/data.txt`
      mockedRealpath.mockResolvedValue(normalize(resolve(filePath)))
      mockedReadFile.mockResolvedValue('custom data' as any)
      mockedStat.mockResolvedValue({ size: 11 } as any)

      const result = await executeFileRead({
        path: filePath,
        allowedDirs: [customDir],
      })
      expect(result.success).toBe(true)
    })

    it('uses normalized path when realpath fails (file does not exist)', async () => {
      // File does not exist, realpath throws
      mockedRealpath.mockRejectedValue(new Error('ENOENT'))

      // But the normalized path is outside allowed dirs
      const result = await executeFileRead({ path: '/somewhere/else/file.txt' })
      expect(result.success).toBe(false)
      expect(result.output.content).toContain('outside allowed directories')
    })
  })

  describe('successful reads', () => {
    it('returns content, size, and encoding', async () => {
      const filePath = `${userDataDir}/test.txt`
      mockedRealpath.mockResolvedValue(normalize(resolve(filePath)))
      mockedReadFile.mockResolvedValue('hello world' as any)
      mockedStat.mockResolvedValue({ size: 11 } as any)

      const result = await executeFileRead({ path: filePath })

      expect(result.success).toBe(true)
      expect(result.output.content).toBe('hello world')
      expect(result.output.size).toBe(11)
      expect(result.output.encoding).toBe('utf-8')
    })

    it('uses custom encoding', async () => {
      const filePath = `${userDataDir}/binary.dat`
      mockedRealpath.mockResolvedValue(normalize(resolve(filePath)))
      mockedReadFile.mockResolvedValue('binary data' as any)
      mockedStat.mockResolvedValue({ size: 100 } as any)

      const result = await executeFileRead({
        path: filePath,
        encoding: 'latin1',
      })

      expect(result.success).toBe(true)
      expect(result.output.encoding).toBe('latin1')
      expect(mockedReadFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ encoding: 'latin1' }),
      )
    })
  })

  describe('error handling', () => {
    it('handles read errors gracefully', async () => {
      const filePath = `${userDataDir}/missing.txt`
      mockedRealpath.mockResolvedValue(normalize(resolve(filePath)))
      mockedReadFile.mockRejectedValue(new Error('ENOENT: no such file'))

      const result = await executeFileRead({ path: filePath })

      expect(result.success).toBe(false)
      expect(result.output.content).toContain('ENOENT')
      expect(result.output.size).toBe(0)
    })

    it('handles non-Error thrown values', async () => {
      const filePath = `${userDataDir}/bad.txt`
      mockedRealpath.mockResolvedValue(normalize(resolve(filePath)))
      mockedReadFile.mockRejectedValue('string error')

      const result = await executeFileRead({ path: filePath })

      expect(result.success).toBe(false)
      expect(result.output.content).toBe('Unknown file error')
    })
  })
})

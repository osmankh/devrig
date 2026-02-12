import { readFile, stat, realpath } from 'node:fs/promises'
import { resolve, normalize } from 'node:path'
import { app } from 'electron'
import { tmpdir } from 'node:os'

export interface FileReadInput {
  path: string
  encoding?: BufferEncoding
  /** Additional directories to allow reads from (beyond defaults). */
  allowedDirs?: string[]
}

export interface FileReadOutput {
  content: string
  size: number
  encoding: string
}

/**
 * Default directories that file reads are restricted to.
 * Security: prevents path traversal and reading sensitive system files.
 */
function getAllowedDirs(extra?: string[]): string[] {
  const dirs = [
    app.getPath('userData'),  // DevRig data directory
    tmpdir(),                 // System temp directory
  ]
  if (extra) {
    dirs.push(...extra)
  }
  return dirs.map((d) => normalize(resolve(d)))
}

/**
 * Validates that a resolved file path is within an allowed directory.
 * Resolves symlinks to prevent symlink-based escapes.
 */
async function validatePath(filePath: string, allowedDirs: string[]): Promise<string | null> {
  const normalized = normalize(resolve(filePath))

  // Block obvious traversal patterns before touching the filesystem
  if (filePath.includes('..')) {
    return 'Path contains ".." traversal'
  }

  // Resolve symlinks to get the true path
  let realPath: string
  try {
    realPath = await realpath(normalized)
  } catch {
    // File doesn't exist yet or not accessible — use normalized path
    realPath = normalized
  }

  // Check the real path is within an allowed directory
  const withinAllowed = allowedDirs.some((dir) => realPath.startsWith(dir + '/') || realPath === dir)
  if (!withinAllowed) {
    return `Path "${realPath}" is outside allowed directories`
  }

  return null // valid
}

export async function executeFileRead(config: FileReadInput): Promise<{ success: boolean; output: FileReadOutput }> {
  const encoding = config.encoding ?? 'utf-8'

  // Security: restrict readable paths to allowed directories
  const allowedDirs = getAllowedDirs(config.allowedDirs)
  const validationError = await validatePath(config.path, allowedDirs)
  if (validationError) {
    console.warn(`[file-executor] Blocked read: ${validationError}`)
    return {
      success: false,
      output: {
        content: `Security: ${validationError}`,
        size: 0,
        encoding,
      },
    }
  }

  try {
    const resolvedPath = normalize(resolve(config.path))
    const [content, fileStat] = await Promise.all([
      readFile(resolvedPath, { encoding: encoding as BufferEncoding }),
      stat(resolvedPath),
    ])

    return {
      success: true,
      output: {
        content,
        size: fileStat.size,
        encoding,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown file error'
    return {
      success: false,
      output: {
        content: message,
        size: 0,
        encoding,
      },
    }
  }
}

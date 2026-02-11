import { readFile, stat } from 'node:fs/promises'

export interface FileReadInput {
  path: string
  encoding?: BufferEncoding
}

export interface FileReadOutput {
  content: string
  size: number
  encoding: string
}

export async function executeFileRead(config: FileReadInput): Promise<{ success: boolean; output: FileReadOutput }> {
  const encoding = config.encoding ?? 'utf-8'

  try {
    const [content, fileStat] = await Promise.all([
      readFile(config.path, { encoding: encoding as BufferEncoding }),
      stat(config.path),
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

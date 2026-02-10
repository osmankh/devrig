import { toast } from 'sonner'

interface OptimisticOptions<T> {
  apply: () => T
  persist: () => Promise<void>
  rollback: (snapshot: T) => void
  onError?: (error: unknown) => void
}

export async function optimisticUpdate<T>({
  apply,
  persist,
  rollback,
  onError
}: OptimisticOptions<T>): Promise<void> {
  const snapshot = apply()
  try {
    await persist()
  } catch (error) {
    rollback(snapshot)
    if (onError) {
      onError(error)
    } else {
      toast.error('Failed to save changes')
    }
  }
}

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import * as aiIpc from '@entities/ai-provider/api/ai-ipc'

type DraftStatus = 'idle' | 'generating' | 'ready' | 'error'

interface AIDraftState {
  itemId: string | null
  draft: string
  editedDraft: string
  status: DraftStatus
  error: string | null
  isEditing: boolean

  generateDraft: (itemId: string, intent?: string) => Promise<void>
  regenerateDraft: () => Promise<void>
  setEditedDraft: (text: string) => void
  startEditing: () => void
  stopEditing: () => void
  approveDraft: () => string
  reset: () => void
}

export const useAIDraftStore = create<AIDraftState>()(
  immer((set, get) => ({
    itemId: null,
    draft: '',
    editedDraft: '',
    status: 'idle',
    error: null,
    isEditing: false,

    generateDraft: async (itemId, intent) => {
      set((s) => {
        s.itemId = itemId
        s.draft = ''
        s.editedDraft = ''
        s.status = 'generating'
        s.error = null
        s.isEditing = false
      })
      try {
        const result = await aiIpc.draftResponse(itemId, intent)
        set((s) => {
          s.draft = result
          s.editedDraft = result
          s.status = 'ready'
        })
      } catch (err) {
        set((s) => {
          s.status = 'error'
          s.error = err instanceof Error ? err.message : 'Failed to generate draft'
        })
      }
    },

    regenerateDraft: async () => {
      const { itemId } = get()
      if (!itemId) return
      await get().generateDraft(itemId)
    },

    setEditedDraft: (text) => {
      set((s) => {
        s.editedDraft = text
      })
    },

    startEditing: () => {
      set((s) => {
        s.isEditing = true
      })
    },

    stopEditing: () => {
      set((s) => {
        s.isEditing = false
      })
    },

    approveDraft: () => {
      const { editedDraft } = get()
      set((s) => {
        s.status = 'idle'
        s.draft = ''
        s.editedDraft = ''
        s.itemId = null
        s.isEditing = false
      })
      return editedDraft
    },

    reset: () => {
      set((s) => {
        s.itemId = null
        s.draft = ''
        s.editedDraft = ''
        s.status = 'idle'
        s.error = null
        s.isEditing = false
      })
    }
  }))
)

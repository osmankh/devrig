import { useCallback, useState } from 'react'
import { Sparkles, RefreshCw, Check, Pencil, X, Loader2 } from 'lucide-react'
import { cn } from '@shared/lib/cn'
import { Button, Textarea, Input } from '@shared/ui'
import { useInboxStore } from '@entities/inbox-item'
import { useAIDraftStore } from '../model/ai-draft-store'

export function AIDraftPanel() {
  const selectedItemId = useInboxStore((s) => s.selectedItemId)
  const draft = useAIDraftStore((s) => s.draft)
  const editedDraft = useAIDraftStore((s) => s.editedDraft)
  const status = useAIDraftStore((s) => s.status)
  const error = useAIDraftStore((s) => s.error)
  const isEditing = useAIDraftStore((s) => s.isEditing)
  const generateDraft = useAIDraftStore((s) => s.generateDraft)
  const regenerateDraft = useAIDraftStore((s) => s.regenerateDraft)
  const setEditedDraft = useAIDraftStore((s) => s.setEditedDraft)
  const startEditing = useAIDraftStore((s) => s.startEditing)
  const stopEditing = useAIDraftStore((s) => s.stopEditing)
  const approveDraft = useAIDraftStore((s) => s.approveDraft)
  const reset = useAIDraftStore((s) => s.reset)

  const [intent, setIntent] = useState('')

  const handleGenerate = useCallback(() => {
    if (!selectedItemId) return
    generateDraft(selectedItemId, intent || undefined)
  }, [selectedItemId, intent, generateDraft])

  const handleApprove = useCallback(() => {
    approveDraft()
    // The approved draft text could be sent via an action plugin
    // For now, just approving clears the panel
  }, [approveDraft])

  const handleDiscard = useCallback(() => {
    reset()
  }, [reset])

  if (!selectedItemId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-muted-foreground">
        <p className="text-xs">Select an item to generate a draft</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">AI Draft</span>
        <div className="flex-1" />
        {status === 'ready' && (
          <button
            type="button"
            onClick={handleDiscard}
            className="text-muted-foreground hover:text-foreground"
            title="Discard draft"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Idle state: show generate form */}
      {status === 'idle' && (
        <div className="flex flex-col gap-2 p-3">
          <Input
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Intent (optional): e.g., decline politely, ask for more info..."
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            onClick={handleGenerate}
            className="h-7 gap-1.5 text-xs"
          >
            <Sparkles className="h-3 w-3" />
            Generate Draft
          </Button>
        </div>
      )}

      {/* Generating state */}
      {status === 'generating' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Generating draft...</p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="flex flex-col gap-2 p-3">
          <p className="text-xs text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            className="h-7 gap-1.5 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      )}

      {/* Ready state: show draft */}
      {status === 'ready' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Draft content */}
          <div className="flex-1 overflow-auto p-3">
            {isEditing ? (
              <Textarea
                value={editedDraft}
                onChange={(e) => setEditedDraft(e.target.value)}
                className="min-h-[120px] resize-none text-sm"
                autoFocus
              />
            ) : (
              <div
                className={cn(
                  'whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm leading-relaxed',
                  editedDraft !== draft && 'border-primary/30 bg-primary/5'
                )}
              >
                {editedDraft}
              </div>
            )}
            {editedDraft !== draft && !isEditing && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Edited from original
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  onClick={stopEditing}
                  className="h-7 gap-1 text-xs"
                >
                  <Check className="h-3 w-3" />
                  Done
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditedDraft(draft)
                    stopEditing()
                  }}
                  className="h-7 text-xs"
                >
                  Reset
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  className="h-7 gap-1 text-xs"
                >
                  <Check className="h-3 w-3" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEditing}
                  className="h-7 gap-1 text-xs"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={regenerateDraft}
                  className="h-7 gap-1 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  Input
} from '@shared/ui'
import { toast } from 'sonner'
import { useFlowStore } from '@entities/flow'
import { useWorkspaceStore } from '@entities/workspace'
import { useRouterStore } from '@app/router/router'

export function CreateFlowButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const createFlow = useFlowStore((s) => s.createFlow)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const navigate = useRouterStore((s) => s.navigate)

  async function handleCreate() {
    if (!name.trim()) return

    let wsId = activeWorkspaceId
    if (!wsId) {
      // Workspace not loaded yet — try loading
      await loadWorkspaces()
      wsId = useWorkspaceStore.getState().activeWorkspaceId
    }
    if (!wsId) {
      toast.error('No workspace available. Please restart the app.')
      return
    }

    setCreating(true)
    try {
      const flow = await createFlow(wsId, name.trim())
      setName('')
      setOpen(false)
      navigate({ view: 'flow-editor', flowId: flow.id })
    } catch (err) {
      toast.error(`Failed to create flow: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Flow</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Flow</DialogTitle>
          <DialogDescription>
            Give your flow a name to get started.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder="Flow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

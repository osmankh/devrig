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
import { useFlowStore } from '@entities/flow'
import { useWorkspaceStore } from '@entities/workspace'
import { useRouterStore } from '@app/router/router'

export function CreateFlowButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const createFlow = useFlowStore((s) => s.createFlow)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const navigate = useRouterStore((s) => s.navigate)

  async function handleCreate() {
    if (!name.trim() || !activeWorkspaceId) return
    const flow = await createFlow(activeWorkspaceId, name.trim())
    setName('')
    setOpen(false)
    navigate({ view: 'flow-editor', flowId: flow.id })
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
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

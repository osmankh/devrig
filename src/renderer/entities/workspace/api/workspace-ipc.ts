import { ipcInvoke } from '@shared/lib/ipc'
import type { Workspace } from '../model/workspace.types'

export async function listWorkspaces(): Promise<Workspace[]> {
  return ipcInvoke<Workspace[]>('db:workspace:list')
}

export async function getWorkspace(id: string): Promise<Workspace> {
  return ipcInvoke<Workspace>('db:workspace:get', id)
}

export async function createWorkspace(data: {
  name: string
}): Promise<Workspace> {
  return ipcInvoke<Workspace>('db:workspace:create', data)
}

export async function updateWorkspace(
  id: string,
  data: { name?: string; settings?: string }
): Promise<Workspace> {
  return ipcInvoke<Workspace>('db:workspace:update', id, data)
}

import { useState, useEffect, useCallback } from 'react'
import { Command } from 'cmdk'
import { useRouterStore } from '@app/router/router'
import { useUIStore } from '@app/stores/ui-store'
import { useShortcutStore, formatShortcut } from '@features/keyboard-shortcuts'
import { useInboxStore } from '@entities/inbox-item'

const GROUP_HEADING_CLASS =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[var(--text-xs)] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[var(--color-text-tertiary)]'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useRouterStore((s) => s.navigate)
  const selectedItemId = useInboxStore((s) => s.selectedItemId)
  const markRead = useInboxStore((s) => s.markRead)
  const archive = useInboxStore((s) => s.archive)
  const snooze = useInboxStore((s) => s.snooze)
  const toggleTheme = useCallback(() => {
    const current = useUIStore.getState().theme
    const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark'
    useUIStore.getState().setTheme(next)
  }, [])

  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => setOpen(false), [])

  // Register the Cmd+K shortcut
  useEffect(() => {
    useShortcutStore.getState().register({
      id: 'command-palette',
      keys: 'mod+k',
      label: 'Open command palette',
      category: 'General',
      action: toggle
    })
    return () => useShortcutStore.getState().unregister('command-palette')
  }, [toggle])

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50"
    >
      <div className="fixed inset-0 bg-black/50" onClick={close} />
      <div className="fixed left-1/2 top-[20%] w-full max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] shadow-2xl">
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Type a command or search..."
          className="w-full border-b border-[var(--color-border-subtle)] bg-transparent px-4 py-3 text-[var(--text-sm)] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
            No results found.
          </Command.Empty>

          <Command.Group heading="Navigation" className={GROUP_HEADING_CLASS}>
            <CommandItem onSelect={() => { navigate({ view: 'inbox' }); close() }} shortcut="mod+1">
              Go to Inbox
            </CommandItem>
            <CommandItem onSelect={() => { navigate({ view: 'dashboard' }); close() }} shortcut="mod+2">
              Go to Dashboard
            </CommandItem>
            <CommandItem onSelect={() => { navigate({ view: 'execution-history' }); close() }}>
              Go to Execution History
            </CommandItem>
            <CommandItem onSelect={() => { navigate({ view: 'settings' }); close() }} shortcut="mod+,">
              Go to Settings
            </CommandItem>
            <CommandItem onSelect={() => { navigate({ view: 'marketplace' }); close() }}>
              Go to Plugin Marketplace
            </CommandItem>
          </Command.Group>

          <Command.Group heading="Inbox" className={GROUP_HEADING_CLASS}>
            <CommandItem
              onSelect={() => {
                if (selectedItemId) markRead([selectedItemId])
                close()
              }}
            >
              Mark as Read
            </CommandItem>
            <CommandItem
              onSelect={() => {
                if (selectedItemId) archive([selectedItemId])
                close()
              }}
              shortcut="e"
            >
              Archive Selected
            </CommandItem>
            <CommandItem
              onSelect={() => {
                if (selectedItemId) snooze(selectedItemId, Date.now() + 3 * 60 * 60 * 1000)
                close()
              }}
              shortcut="h"
            >
              Snooze (3 hours)
            </CommandItem>
          </Command.Group>

          <Command.Group heading="Settings" className={GROUP_HEADING_CLASS}>
            <CommandItem onSelect={() => { toggleTheme(); close() }}>
              Toggle Theme
            </CommandItem>
          </Command.Group>

          <Command.Group heading="Shortcuts" className={GROUP_HEADING_CLASS}>
            {useShortcutStore
              .getState()
              .getAll()
              .filter((s) => s.id !== 'command-palette' && !s.id.startsWith('nav-'))
              .map((s) => (
                <CommandItem
                  key={s.id}
                  onSelect={() => { s.action(); close() }}
                  shortcut={s.keys}
                >
                  {s.label}
                </CommandItem>
              ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  )
}

function CommandItem({
  children,
  onSelect,
  shortcut
}: {
  children: React.ReactNode
  onSelect: () => void
  shortcut?: string
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between rounded-[var(--radius-md)] px-2 py-2 text-[var(--text-sm)] text-[var(--color-text-primary)] aria-selected:bg-[var(--color-bg-hover)]"
    >
      <span>{children}</span>
      {shortcut && (
        <kbd className="ml-auto text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
          {formatShortcut(shortcut)}
        </kbd>
      )}
    </Command.Item>
  )
}

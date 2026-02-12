import { create } from 'zustand'

export interface Shortcut {
  id: string
  keys: string // e.g. "mod+k", "mod+shift+p"
  label: string
  category: string
  action: () => void
  when?: () => boolean // context guard
}

interface ShortcutState {
  shortcuts: Map<string, Shortcut>
  register: (shortcut: Shortcut) => void
  unregister: (id: string) => void
  getAll: () => Shortcut[]
  getByCategory: (category: string) => Shortcut[]
}

export const useShortcutStore = create<ShortcutState>()((set, get) => ({
  shortcuts: new Map(),

  register: (shortcut) => {
    set((state) => {
      const next = new Map(state.shortcuts)
      next.set(shortcut.id, shortcut)
      return { shortcuts: next }
    })
  },

  unregister: (id) => {
    set((state) => {
      const next = new Map(state.shortcuts)
      next.delete(id)
      return { shortcuts: next }
    })
  },

  getAll: () => Array.from(get().shortcuts.values()),

  getByCategory: (category) =>
    Array.from(get().shortcuts.values()).filter((s) => s.category === category)
}))

/** Parse "mod+k" into { metaKey/ctrlKey, key } for matching */
function parseKeys(keys: string): {
  meta: boolean
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string
} {
  const parts = keys.toLowerCase().split('+')
  const isMac = navigator.platform.includes('Mac')
  const hasMod = parts.includes('mod')

  return {
    meta: hasMod ? isMac : parts.includes('meta'),
    ctrl: hasMod ? !isMac : parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.filter((p) => !['mod', 'meta', 'ctrl', 'shift', 'alt'].includes(p))[0] ?? ''
  }
}

function matchesEvent(
  e: KeyboardEvent,
  parsed: ReturnType<typeof parseKeys>
): boolean {
  return (
    e.key.toLowerCase() === parsed.key &&
    e.metaKey === parsed.meta &&
    e.ctrlKey === parsed.ctrl &&
    e.shiftKey === parsed.shift &&
    e.altKey === parsed.alt
  )
}

/** Global keyboard event listener. Call once at app startup. */
export function initKeyboardShortcuts(): () => void {
  function handler(e: KeyboardEvent) {
    // Don't intercept when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // Allow mod+k even in inputs (command palette)
      const parsed = parseKeys('mod+k')
      if (matchesEvent(e, parsed)) {
        // fall through to check shortcuts
      } else {
        return
      }
    }

    const shortcuts = useShortcutStore.getState().shortcuts
    for (const shortcut of shortcuts.values()) {
      const parsed = parseKeys(shortcut.keys)
      if (matchesEvent(e, parsed)) {
        if (shortcut.when && !shortcut.when()) continue
        e.preventDefault()
        e.stopPropagation()
        shortcut.action()
        return
      }
    }
  }

  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}

/** Format shortcut keys for display */
export function formatShortcut(keys: string): string {
  const isMac = navigator.platform.includes('Mac')
  return keys
    .split('+')
    .map((k) => {
      switch (k.toLowerCase()) {
        case 'mod':
          return isMac ? '\u2318' : 'Ctrl'
        case 'shift':
          return isMac ? '\u21E7' : 'Shift'
        case 'alt':
          return isMac ? '\u2325' : 'Alt'
        case 'meta':
          return isMac ? '\u2318' : 'Win'
        case 'enter':
          return '\u21B5'
        case 'backspace':
          return '\u232B'
        case 'escape':
          return 'Esc'
        default:
          return k.toUpperCase()
      }
    })
    .join(isMac ? '' : '+')
}

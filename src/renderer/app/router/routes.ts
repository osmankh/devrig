export type Route =
  | { view: 'inbox'; itemId?: string }
  | { view: 'dashboard' }
  | { view: 'flow-editor'; flowId: string }
  | { view: 'execution-history' }
  | { view: 'settings'; section?: string }
  | { view: 'marketplace'; pluginId?: string }

export const DEFAULT_ROUTE: Route = { view: 'inbox' }

/** Parse a deep link path into a Route */
export function parseDeepLink(path: string): Route | null {
  const segments = path.replace(/^\/+/, '').split('/')

  switch (segments[0]) {
    case 'inbox':
      return { view: 'inbox', itemId: segments[1] }
    case 'dashboard':
      return { view: 'dashboard' }
    case 'flow':
      if (segments[1]) return { view: 'flow-editor', flowId: segments[1] }
      return { view: 'dashboard' }
    case 'history':
      return { view: 'execution-history' }
    case 'settings':
      return { view: 'settings', section: segments[1] }
    case 'marketplace':
      return { view: 'marketplace', pluginId: segments[1] }
    default:
      return null
  }
}

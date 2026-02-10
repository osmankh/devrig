export type Route =
  | { view: 'dashboard' }
  | { view: 'flow-editor'; flowId: string }
  | { view: 'execution-history' }
  | { view: 'settings'; section?: string }

export const DEFAULT_ROUTE: Route = { view: 'dashboard' }

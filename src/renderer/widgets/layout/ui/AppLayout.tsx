import type { ReactNode } from 'react'
import { Sidebar } from '@widgets/sidebar'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}

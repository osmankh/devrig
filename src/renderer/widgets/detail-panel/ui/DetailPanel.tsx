import { useInboxStore } from '@entities/inbox-item'
import { DetailPanelHeader } from './DetailPanelHeader'
import { DetailPanelAISummary } from './DetailPanelAISummary'
import { DetailPanelBody } from './DetailPanelBody'

export function DetailPanel() {
  const selectedItemId = useInboxStore((s) => s.selectedItemId)
  const items = useInboxStore((s) => s.items)
  const item = selectedItemId ? items[selectedItemId] : null

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select an item to view details</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DetailPanelHeader item={item} />
      <DetailPanelAISummary item={item} />
      <DetailPanelBody item={item} />
    </div>
  )
}

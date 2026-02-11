export function TriggerConfigForm({ config, onChange }: { config: string | null; onChange: (config: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Trigger Type</label>
      <div className="text-[var(--text-xs)] text-[var(--color-text-primary)]">Manual</div>
      <p className="text-[11px] text-[var(--color-text-tertiary)]">
        This workflow will be started manually via the Run button.
      </p>
    </div>
  )
}

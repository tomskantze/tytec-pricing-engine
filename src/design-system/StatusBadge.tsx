export type StatusTone = 'neutral' | 'success' | 'warning' | 'critical'

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return <span className={`erp-status-badge erp-status-badge-${tone}`}>{label}</span>
}

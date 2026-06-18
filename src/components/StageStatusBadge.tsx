'use client'
import type { StageStatus } from '@/lib/types'
import { useLanguage } from './LanguageProvider'

const CLASSES: Record<StageStatus, { className: string; dot: string }> = {
  pending:     { className: 'bg-gray-100 text-gray-600 border-gray-200',                  dot: 'bg-gray-400' },
  in_progress: { className: 'bg-blue-50 text-blue-700 border-blue-200',                   dot: 'bg-blue-500 animate-pulse' },
  reviewing:   { className: 'bg-purple-50 text-purple-700 border-purple-200',             dot: 'bg-purple-500 animate-pulse' },
  completed:   { className: 'bg-green-50 text-green-700 border-green-200',                dot: 'bg-green-500' },
  overdue:     { className: 'bg-red-50 text-red-700 border-red-300 font-semibold',        dot: 'bg-red-500 animate-ping' },
}

export default function StageStatusBadge({ status }: { status: StageStatus }) {
  const { t } = useLanguage()
  const labels: Record<StageStatus, string> = {
    pending:     t.statusPending,
    in_progress: t.statusInProgress,
    reviewing:   t.statusReviewing,
    completed:   t.statusCompleted,
    overdue:     t.statusOverdue,
  }
  const c = CLASSES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border ${c.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {labels[status]}
    </span>
  )
}

'use client'
import type { StageStatus } from '@/lib/types'

const CONFIG: Record<StageStatus, { label: string; className: string; dot: string }> = {
  pending:     { label: '待機中',   className: 'bg-gray-100 text-gray-600 border-gray-200',     dot: 'bg-gray-400' },
  in_progress: { label: '進行中',   className: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500 animate-pulse' },
  completed:   { label: '完了',     className: 'bg-green-50 text-green-700 border-green-200',    dot: 'bg-green-500' },
  overdue:     { label: '期限超過', className: 'bg-red-50 text-red-700 border-red-300 font-semibold', dot: 'bg-red-500 animate-ping' },
}

export default function StageStatusBadge({ status }: { status: StageStatus }) {
  const c = CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border ${c.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

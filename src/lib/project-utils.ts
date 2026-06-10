import type { Project } from './types'
import type { Translations } from './i18n'

export function getProjectStatus(project: Project, t: Translations) {
  if (project.stages.length === 0) return { label: t.noStages, color: 'text-gray-400', bg: 'bg-gray-50' }
  const now = new Date()
  const hasOverdue = project.stages.some(
    (s) => s.status !== 'completed' && new Date(s.deadline) < now
  )
  const allDone = project.stages.every((s) => s.status === 'completed')
  const current = project.stages
    .filter((s) => s.status !== 'completed')
    .sort((a, b) => a.order - b.order)[0]

  if (allDone) return { label: t.allDone, color: 'text-green-700', bg: 'bg-green-50' }
  if (hasOverdue) return { label: t.overdueExists, color: 'text-red-700', bg: 'bg-red-50' }
  if (current) return { label: `${current.order}: ${current.name}`, color: 'text-blue-700', bg: 'bg-blue-50' }
  return { label: t.statusInProgress, color: 'text-blue-700', bg: 'bg-blue-50' }
}

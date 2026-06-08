'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import type { Project, Team, Stage } from '@/lib/types'
import StageTimeline from '@/components/StageTimeline'
import AddStageForm from '@/components/AddStageForm'
import { useDarkMode } from '@/components/DarkModeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { LOCALES, type Locale } from '@/lib/i18n'

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { t, locale, setLocale } = useLanguage()
  const [project, setProject] = useState<Project | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [p, tm] = await Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch('/api/teams').then((r) => r.json()),
    ])
    setProject(p)
    setTeams(tm)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleStageUpdate(stageId: string, data: Partial<Stage>) {
    await fetch(`/api/projects/${id}/stages/${stageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    load()
  }

  async function handleStageDelete(stageId: string) {
    if (!confirm(t.deleteStageConfirm)) return
    await fetch(`/api/projects/${id}/stages/${stageId}`, { method: 'DELETE' })
    load()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">{t.loading}</div>
    </div>
  )

  if (!project || 'error' in project) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      {t.caseNotFound}
    </div>
  )

  const now = new Date()
  const totalStages = project.stages.length
  const completedCount = project.stages.filter((s) => s.status === 'completed').length
  const overdueCount = project.stages.filter(
    (s) => s.status !== 'completed' && new Date(s.deadline) < now
  ).length
  const progressPct = totalStages > 0 ? Math.round((completedCount / totalStages) * 100) : 0
  const nextOrder = project.stages.length > 0
    ? Math.max(...project.stages.map((s) => s.order)) + 1
    : 1
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'ja-JP'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">{t.back}</Link>
            <span className="text-gray-300">|</span>
            <span className="text-2xl">🚦</span>
            <h1 className="text-lg font-bold text-gray-900 truncate">{project.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/teams" className="text-sm text-gray-500 hover:text-gray-900">{t.teamManagement}</Link>
            <div className="flex items-center gap-1 text-xs">
              {LOCALES.map((l) => (
                <button key={l.value} onClick={() => setLocale(l.value as Locale)}
                  className={`px-2 py-0.5 rounded transition-colors ${locale === l.value ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-700'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <button
              onClick={toggleDark}
              className="no-invert text-lg leading-none opacity-60 hover:opacity-100 transition-opacity"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Project summary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          {project.description && (
            <p className="text-gray-500 text-sm mb-4">{project.description}</p>
          )}

          {/* Progress */}
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  overdueCount > 0 ? 'bg-red-500' :
                  progressPct === 100 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
              {completedCount}/{totalStages} ({progressPct}%)
            </span>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-gray-500">{t.stagesLabel(totalStages)}</span>
            <span className="text-green-600 font-medium">{t.completedLabel(completedCount)}</span>
            {overdueCount > 0 && (
              <span className="text-red-600 font-semibold">{t.overdueLabel(overdueCount)}</span>
            )}
            <span className="text-gray-400">
              {t.createdLabel} {new Date(project.createdAt).toLocaleDateString(dateLocale)}
            </span>
          </div>
        </div>

        {/* Teams used */}
        {project.stages.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {Array.from(new Set(project.stages.map((s) => s.teamId))).map((teamId) => {
              const team = teams.find((tm) => tm.id === teamId)
              if (!team) return null
              return (
                <span key={teamId} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-white border border-gray-200 text-gray-700">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                  {team.name}
                </span>
              )
            })}
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-6">{t.stageTimeline}</h2>
          {teams.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p>{t.noTeamsMessage}</p>
              <Link href="/teams" className="text-blue-600 text-sm hover:underline mt-1 inline-block">
                {t.addTeamLink}
              </Link>
            </div>
          ) : (
            <>
              <StageTimeline
                project={project}
                teams={teams}
                onStageUpdate={handleStageUpdate}
                onStageDelete={handleStageDelete}
              />
              <AddStageForm
                projectId={project.id}
                teams={teams}
                nextOrder={nextOrder}
                existingStages={project.stages}
                onAdded={load}
              />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

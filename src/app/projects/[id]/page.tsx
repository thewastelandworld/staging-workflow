'use client'

import { useEffect, useState, use, Suspense } from 'react'
import Link from 'next/link'
import type { Project, Team, Stage } from '@/lib/types'
import StageTimeline from '@/components/StageTimeline'
import AddStageForm from '@/components/AddStageForm'
import BulkCheckContentEditor from '@/components/BulkCheckContentEditor'
import { useDarkMode } from '@/components/DarkModeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { useSession } from '@/components/SessionProvider'
import { LOCALES, type Locale } from '@/lib/i18n'

export default function ProjectPageWrapper({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <ProjectPage params={params} />
    </Suspense>
  )
}

function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { t, locale, setLocale } = useLanguage()
  const { session, loading: sessionLoading, logout } = useSession()
  const isReadOnly = !sessionLoading && session?.role === 'readonly'
  const [project, setProject] = useState<Project | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

  async function load() {
    const [pRes, tmRes] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch('/api/teams'),
    ])
    if (pRes.status === 401 || tmRes.status === 401) {
      window.location.href = '/login'
      return
    }
    const [p, tm] = await Promise.all([pRes.json(), tmRes.json()])
    setProject(p)
    setTeams(Array.isArray(tm) ? tm : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function saveMeta(name: string, description: string) {
    setSavingMeta(true)
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })
    if (res.ok) {
      const updated = await res.json()
      setProject(updated)
    }
    setSavingMeta(false)
  }

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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm flex-shrink-0">{t.back}</Link>
            <span className="text-gray-300 flex-shrink-0">|</span>
            <span className="text-xl sm:text-2xl flex-shrink-0">🚦</span>
            {editingName ? (
              <input
                autoFocus
                className="text-sm sm:text-lg font-bold text-gray-900 border-b border-blue-400 bg-transparent outline-none truncate w-40 sm:w-64"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  setEditingName(false)
                  if (editName.trim() && editName !== project.name) {
                    saveMeta(editName.trim(), project.description ?? '')
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') { setEditName(project.name); setEditingName(false) }
                }}
                disabled={savingMeta}
              />
            ) : (
              <h1
                className={`text-sm sm:text-lg font-bold text-gray-900 truncate ${!isReadOnly ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                onClick={() => { if (!isReadOnly) { setEditName(project.name); setEditingName(true) } }}
                title={!isReadOnly ? t.edit : undefined}
              >
                {project.name}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Link href="/teams" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900">{t.teamManagement}</Link>
            <div className="flex items-center gap-0.5 sm:gap-1 text-xs">
              {LOCALES.map((l) => (
                <button key={l.value} onClick={() => setLocale(l.value as Locale)}
                  className={`px-1.5 sm:px-2 py-0.5 rounded transition-colors ${locale === l.value ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-700'}`}>
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
            {session && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-gray-200">
                <span className="hidden sm:block text-xs text-gray-500">{session.user}</span>
                {session.role === 'readonly' && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">読取</span>
                )}
                <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">ログアウト</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Project summary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4 sm:mb-6">
          {editingDesc ? (
            <textarea
              autoFocus
              rows={2}
              className="w-full text-sm text-gray-700 border border-blue-300 rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-blue-300"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              onBlur={() => {
                setEditingDesc(false)
                if (editDesc !== project.description) {
                  saveMeta(project.name, editDesc)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditDesc(project.description ?? ''); setEditingDesc(false) }
              }}
              disabled={savingMeta}
            />
          ) : (
            <p
              className={`text-gray-500 text-sm mb-4 min-h-[1.25rem] whitespace-pre-wrap ${!isReadOnly ? 'cursor-pointer hover:text-gray-700 transition-colors' : ''}`}
              onClick={() => { if (!isReadOnly) { setEditDesc(project.description ?? ''); setEditingDesc(true) } }}
              title={!isReadOnly ? t.edit : undefined}
            >
              {project.description || <span className="text-gray-300 italic">{t.descriptionPlaceholder}</span>}
            </p>
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="font-semibold text-gray-900">{t.stageTimeline}</h2>
            {!isReadOnly && (
              <BulkCheckContentEditor
                projectId={project.id}
                stages={project.stages}
                teams={teams}
                onSaved={load}
              />
            )}
          </div>
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
                isReadOnly={isReadOnly}
              />
              {!isReadOnly && (
                <AddStageForm
                  projectId={project.id}
                  teams={teams}
                  nextOrder={nextOrder}
                  existingStages={project.stages}
                  onAdded={load}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

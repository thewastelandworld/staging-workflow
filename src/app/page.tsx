'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Project, Team, Stage } from '@/lib/types'
import { useDarkMode } from '@/components/DarkModeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { useSession } from '@/components/SessionProvider'
import { LOCALES, type Locale } from '@/lib/i18n'
import { getProjectStatus } from '@/lib/project-utils'

function getCurrentStageInfo(project: Project, teams: Team[]) {
  if (project.stages.length === 0) return null
  const sorted = [...project.stages].sort((a, b) => a.order - b.order)
  const activeStage = sorted.find((s) => s.status !== 'completed')
  if (!activeStage) return null
  const stepNum = sorted.indexOf(activeStage) + 1

  if (activeStage.status === 'reviewing') {
    const nextReviewer = [...(activeStage.reviewers ?? [])]
      .sort((a, b) => a.order - b.order)
      .find((r) => !r.checkedAt)
    if (nextReviewer) {
      const team = teams.find((t) => t.id === nextReviewer.teamId)
      if (team) return { stageName: activeStage.name, stepNum, team, isReviewer: true }
    }
  }

  const team = teams.find((t) => t.id === activeStage.teamId)
  if (!team) return null
  return { stageName: activeStage.name, stepNum, team, isReviewer: false }
}

export default function DashboardPage() {
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { t, locale, setLocale } = useLanguage()
  const { session, loading: sessionLoading, logout } = useSession()
  const isAdmin = !sessionLoading && session?.permission === 'admin'
  const userTeamIds = session?.teamIds ?? []
  const canAdd = !sessionLoading && !!session && session.permission !== 'readonly'
  const [projects, setProjects] = useState<Project[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  async function load() {
    const [pRes, tmRes] = await Promise.all([
      fetch('/api/projects'),
      fetch('/api/teams'),
    ])
    if (pRes.status === 401 || tmRes.status === 401) {
      window.location.href = '/login'
      return
    }
    const [p, tm] = await Promise.all([pRes.json(), tmRes.json()])
    setProjects(Array.isArray(p) ? p : [])
    setTeams(Array.isArray(tm) ? tm : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc }),
    })
    setNewName('')
    setNewDesc('')
    setShowForm(false)
    setCreating(false)
    load()
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportError(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/projects/import', { method: 'POST', body: fd })
    const data = await res.json()
    setImporting(false)
    if (!res.ok) {
      setImportError(data.error ?? 'インポートに失敗しました')
    } else {
      await load()
    }
  }

  async function deleteProject(id: string) {
    if (!confirm(t.deleteCase)) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    load()
  }

  const totalStages = projects.reduce((s, p) => s + p.stages.length, 0)
  const completedStages = projects.reduce(
    (s, p) => s + p.stages.filter((st: Stage) => st.status === 'completed').length,
    0
  )
  const overdueProjects = projects.filter((p) =>
    p.stages.some((s: Stage) => s.status !== 'completed' && new Date(s.deadline) < new Date())
  ).length

  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'ja-JP'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">{t.loading}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl sm:text-2xl flex-shrink-0">🚦</span>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">Staging Workflow</h1>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <Link href="/" className="hidden sm:block text-sm font-medium text-blue-600">{t.dashboard}</Link>
            <Link href="/teams" className="text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.teamManagement}</Link>
            {!sessionLoading && session?.permission === 'admin' && (
              <Link href="/admin/users" className="text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors">ユーザー管理</Link>
            )}
            <div className="flex items-center gap-0.5 sm:gap-1 text-xs">
              {LOCALES.map((l) => (
                <button key={l.value} onClick={() => setLocale(l.value as Locale)}
                  className={`px-1.5 sm:px-2 py-0.5 rounded transition-colors ${locale === l.value ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-700'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <button onClick={toggleDark} className="no-invert text-lg leading-none opacity-60 hover:opacity-100 transition-opacity">
              {isDark ? '☀️' : '🌙'}
            </button>
            {session && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-gray-200">
                <Link href="/profile" className="hidden sm:block text-xs text-gray-500 hover:text-blue-600 transition-colors">{session.displayName ?? session.user}</Link>
                {session.permission === 'readonly' && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">読取</span>
                )}
                <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">ログアウト</button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {[
            { label: t.cases, value: projects.length, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: t.teams, value: teams.length, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: t.stagesCompleted, value: `${completedStages}/${totalStages}`, color: 'text-green-600', bg: 'bg-green-50' },
            { label: t.overdue, value: overdueProjects, color: 'text-red-600', bg: 'bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-3 sm:p-4`}>
              <div className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs sm:text-sm text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Case list header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">{t.caseList}</h2>
          {canAdd && (
            <div className="flex items-center gap-2">
              <label className={`px-3 sm:px-4 py-2 rounded-lg text-sm border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                {importing ? 'インポート中...' : 'Excelインポート'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} disabled={importing} />
              </label>
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                {t.newCase}
              </button>
            </div>
          )}
        </div>

        {/* Import error */}
        {importError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-red-700">{importError}</span>
            <button onClick={() => setImportError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none ml-3">✕</button>
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <form onSubmit={createProject} className="mb-6 p-4 bg-white border border-blue-200 rounded-xl shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder={t.caseNamePlaceholder}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <textarea
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                placeholder={t.descriptionPlaceholder}
                rows={3}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button type="submit" disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {creating ? t.creating : t.create}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                {t.cancel}
              </button>
            </div>
          </form>
        )}

        {/* Empty state */}
        {projects.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-medium">{t.noCases}</p>
            <p className="text-sm mt-1">{t.noCasesHint}</p>
          </div>
        ) : (
          <>
            {/* PC: table */}
            <div className="hidden sm:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-medium w-64">{t.caseName}</th>
                    <th className="text-left px-5 py-3 font-medium">{t.description}</th>
                    <th className="text-left px-5 py-3 font-medium w-48">{t.status}</th>
                    <th className="text-left px-5 py-3 font-medium w-56">{t.currentStage}</th>
                    <th className="text-left px-5 py-3 font-medium w-24">{t.progress}</th>
                    <th className="text-left px-5 py-3 font-medium">{t.createdAt}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {projects.map((p) => {
                    const stat = getProjectStatus(p, t)
                    const now = new Date()
                    const overdueCount = p.stages.filter(
                      (s: Stage) => s.status !== 'completed' && new Date(s.deadline) < now
                    ).length
                    const problemStages = p.stages.filter(
                      (s: Stage) => s.status !== 'completed' && s.problem
                    )
                    const problemCount = problemStages.length
                    const doneCount = p.stages.filter((s: Stage) => s.status === 'completed').length
                    const progress = p.stages.length > 0 ? (doneCount / p.stages.length) * 100 : 0

                    const stageInfo = getCurrentStageInfo(p, teams)

                    return (
                      <tr key={p.id} className={`transition-colors ${
                        problemCount > 0 ? 'bg-orange-50 hover:bg-orange-100' :
                        overdueCount > 0 ? 'bg-red-50 hover:bg-red-100' :
                        'hover:bg-gray-50'
                      }`}>
                        <td className="px-5 py-4 w-64">
                          <Link href={`/projects/${p.id}`}
                            className="font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                            {p.name}
                          </Link>
                          {problemStages.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {problemStages.map((s) => (
                                <div key={s.id} className="text-xs text-orange-700">
                                  <span className="font-medium">{s.name}:</span>{' '}
                                  <span className="text-orange-600">{s.problem!.length > 60 ? s.problem!.slice(0, 60) + '…' : s.problem}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-gray-400 max-w-xs truncate">
                          {p.description || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4 w-48">
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${stat.bg} ${stat.color}`}>
                              {stat.label}
                            </span>
                            {overdueCount > 0 && (
                              <span className="text-xs text-red-600 font-semibold">
                                {t.overdueCount(overdueCount)}
                              </span>
                            )}
                            {problemCount > 0 && (
                              <span className="text-xs text-orange-600 font-semibold">
                                {t.problemCount(problemCount)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 w-56 min-w-[14rem]">
                          {stageInfo ? (
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[13rem]">
                                {stageInfo.stepNum}. {stageInfo.stageName}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stageInfo.team.color }} />
                                <span className="text-xs font-medium text-gray-700">{stageInfo.team.name}</span>
                                {stageInfo.isReviewer && (
                                  <span className="text-xs text-purple-500 bg-purple-50 px-1 rounded">確認</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 w-24">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${problemCount > 0 ? 'bg-orange-400' : overdueCount > 0 ? 'bg-red-500' : progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.max(progress, 3)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">{doneCount}/{p.stages.length}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-400">
                          {new Date(p.createdAt).toLocaleDateString(dateLocale)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {(isAdmin || p.stages.some((s: Stage) => userTeamIds.includes(s.teamId))) && (
                            <button onClick={() => deleteProject(p.id)}
                              className="text-gray-300 hover:text-red-400 transition-colors text-base">✕</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="sm:hidden space-y-3">
              {projects.map((p) => {
                const stat = getProjectStatus(p, t)
                const now = new Date()
                const overdueCount = p.stages.filter(
                  (s: Stage) => s.status !== 'completed' && new Date(s.deadline) < now
                ).length
                const problemStages = p.stages.filter(
                  (s: Stage) => s.status !== 'completed' && s.problem
                )
                const problemCount = problemStages.length
                const doneCount = p.stages.filter((s: Stage) => s.status === 'completed').length
                const progress = p.stages.length > 0 ? (doneCount / p.stages.length) * 100 : 0
                const stageInfo = getCurrentStageInfo(p, teams)

                return (
                  <div key={p.id} className={`rounded-xl border shadow-sm p-4 ${
                    problemCount > 0 ? 'bg-orange-50 border-orange-200' :
                    overdueCount > 0 ? 'bg-red-50 border-red-200' :
                    'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/projects/${p.id}`}
                        className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-base leading-snug">
                        {p.name}
                      </Link>
                      {(isAdmin || p.stages.some((s: Stage) => userTeamIds.includes(s.teamId))) && (
                        <button onClick={() => deleteProject(p.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors text-base flex-shrink-0">✕</button>
                      )}
                    </div>

                    {p.description && (
                      <p className="text-sm text-gray-400 mt-1 line-clamp-2">{p.description}</p>
                    )}

                    {problemStages.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {problemStages.map((s) => (
                          <div key={s.id} className="text-xs text-orange-700">
                            <span className="font-medium">{s.name}:</span>{' '}
                            <span className="text-orange-600">{s.problem!.length > 50 ? s.problem!.slice(0, 50) + '…' : s.problem}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stat.bg} ${stat.color}`}>
                        {stat.label}
                      </span>
                      {overdueCount > 0 && (
                        <span className="text-xs text-red-600 font-semibold">{t.overdueCount(overdueCount)}</span>
                      )}
                      {problemCount > 0 && (
                        <span className="text-xs text-orange-600 font-semibold">{t.problemCount(problemCount)}</span>
                      )}
                    </div>

                    {stageInfo && (
                      <div className="mt-2 flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs text-gray-400 flex-shrink-0">{stageInfo.stepNum}.</span>
                        <span className="text-xs text-gray-600 truncate">{stageInfo.stageName}</span>
                        <span className="text-gray-300 flex-shrink-0">›</span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stageInfo.team.color }} />
                        <span className="text-xs font-medium text-gray-700 truncate">{stageInfo.team.name}</span>
                        {stageInfo.isReviewer && (
                          <span className="text-xs text-purple-500 bg-purple-50 px-1 rounded flex-shrink-0">確認</span>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${problemCount > 0 ? 'bg-orange-400' : overdueCount > 0 ? 'bg-red-500' : progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.max(progress, 3)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{doneCount}/{p.stages.length}</span>
                    </div>

                    <div className="mt-1.5 text-xs text-gray-400">
                      {t.createdAt}: {new Date(p.createdAt).toLocaleDateString(dateLocale)}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Project, Team, Stage } from '@/lib/types'
import { useDarkMode } from '@/components/DarkModeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { LOCALES, type Locale } from '@/lib/i18n'

import type { Translations } from '@/lib/i18n'

function getProjectStatus(project: Project, t: Translations) {
  if (project.stages.length === 0) return { label: t.noStages, color: 'text-gray-400', bg: 'bg-gray-50' }
  const now = new Date()
  const hasOverdue = project.stages.some(
    (s) => s.status !== 'completed' && new Date(s.deadline) < now
  )
  const allDone = project.stages.every((s) => s.status === 'completed')
  const current = project.stages.filter((s) => s.status !== 'completed').sort((a, b) => a.order - b.order)[0]

  if (allDone) return { label: t.allDone, color: 'text-green-700', bg: 'bg-green-50' }
  if (hasOverdue) return { label: t.overdueExists, color: 'text-red-700', bg: 'bg-red-50' }
  if (current) return { label: `${current.order}: ${current.name}`, color: 'text-blue-700', bg: 'bg-blue-50' }
  return { label: t.statusInProgress, color: 'text-blue-700', bg: 'bg-blue-50' }
}

export default function DashboardPage() {
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { t, locale, setLocale } = useLanguage()
  const [projects, setProjects] = useState<Project[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const [p, t] = await Promise.all([
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/teams').then((r) => r.json()),
    ])
    setProjects(p)
    setTeams(t)
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
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚦</span>
            <h1 className="text-xl font-bold text-gray-900">Staging Workflow</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium text-blue-600">{t.dashboard}</Link>
            <Link href="/teams" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.teamManagement}</Link>
            <div className="flex items-center gap-1 text-xs">
              {LOCALES.map((l) => (
                <button key={l.value} onClick={() => setLocale(l.value as Locale)}
                  className={`px-2 py-0.5 rounded transition-colors ${locale === l.value ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-700'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <button onClick={toggleDark} className="no-invert text-lg leading-none opacity-60 hover:opacity-100 transition-opacity">
              {isDark ? '☀️' : '🌙'}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: t.cases, value: projects.length, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: t.teams, value: teams.length, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: t.stagesCompleted, value: `${completedStages}/${totalStages}`, color: 'text-green-600', bg: 'bg-green-50' },
            { label: t.overdue, value: overdueProjects, color: 'text-red-600', bg: 'bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Project list header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t.caseList}</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            {t.newCase}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={createProject} className="mb-6 p-4 bg-white border border-blue-200 rounded-xl shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        {/* Projects table */}
        {projects.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-medium">{t.noCases}</p>
            <p className="text-sm mt-1">{t.noCasesHint}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">{t.caseName}</th>
                  <th className="text-left px-5 py-3 font-medium">{t.description}</th>
                  <th className="text-left px-5 py-3 font-medium">{t.status}</th>
                  <th className="text-left px-5 py-3 font-medium">{t.progress}</th>
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
                  const problemCount = p.stages.filter(
                    (s: Stage) => s.status !== 'completed' && s.problem
                  ).length
                  const doneCount = p.stages.filter((s: Stage) => s.status === 'completed').length
                  const progress = p.stages.length > 0 ? (doneCount / p.stages.length) * 100 : 0

                  return (
                    <tr key={p.id} className={`transition-colors ${
                      problemCount > 0 ? 'bg-orange-50 hover:bg-orange-100' :
                      overdueCount > 0 ? 'bg-red-50 hover:bg-red-100' :
                      'hover:bg-gray-50'
                    }`}>
                      <td className="px-5 py-4">
                        <Link href={`/projects/${p.id}`}
                          className="font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-gray-400 max-w-xs truncate">
                        {p.description || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${stat.bg} ${stat.color}`}>
                          {stat.label}
                        </span>
                        {overdueCount > 0 && (
                          <span className="ml-2 text-xs text-red-600 font-semibold">
                            {t.overdueCount(overdueCount)}
                          </span>
                        )}
                        {problemCount > 0 && (
                          <span className="ml-2 text-xs text-orange-600 font-semibold">
                            {t.problemCount(problemCount)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${overdueCount > 0 ? 'bg-red-500' : progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.max(progress, 3)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{doneCount}/{p.stages.length}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-400">
                        {new Date(p.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'ja-JP')}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => deleteProject(p.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors text-base">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

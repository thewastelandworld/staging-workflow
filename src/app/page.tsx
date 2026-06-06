'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Project, Team, Stage } from '@/lib/types'

function getProjectStatus(project: Project) {
  if (project.stages.length === 0) return { label: 'ステージなし', color: 'text-gray-400', bg: 'bg-gray-50' }
  const now = new Date()
  const hasOverdue = project.stages.some(
    (s) => s.status !== 'completed' && new Date(s.deadline) < now
  )
  const allDone = project.stages.every((s) => s.status === 'completed')
  const current = project.stages.filter((s) => s.status !== 'completed').sort((a, b) => a.order - b.order)[0]

  if (allDone) return { label: '全完了 ✓', color: 'text-green-700', bg: 'bg-green-50' }
  if (hasOverdue) return { label: '⚠ 期限超過あり', color: 'text-red-700', bg: 'bg-red-50' }
  if (current) return { label: `ステージ ${current.order}: ${current.name}`, color: 'text-blue-700', bg: 'bg-blue-50' }
  return { label: '進行中', color: 'text-blue-700', bg: 'bg-blue-50' }
}

export default function DashboardPage() {
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
    if (!confirm('プロジェクトを削除しますか？')) return
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
        <div className="text-gray-400 animate-pulse">読み込み中...</div>
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
            <Link href="/" className="text-sm font-medium text-blue-600">ダッシュボード</Link>
            <Link href="/teams" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">チーム管理</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'プロジェクト', value: projects.length, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'チーム', value: teams.length, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'ステージ完了', value: `${completedStages}/${totalStages}`, color: 'text-green-600', bg: 'bg-green-50' },
            { label: '期限超過', value: overdueProjects, color: 'text-red-600', bg: 'bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Project list header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">プロジェクト一覧</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            + 新規プロジェクト
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={createProject} className="mb-6 p-4 bg-white border border-blue-200 rounded-xl shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="プロジェクト名 *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <input
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="説明（任意）"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button type="submit" disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {creating ? '作成中...' : '作成'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                キャンセル
              </button>
            </div>
          </form>
        )}

        {/* Projects grid */}
        {projects.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-medium">プロジェクトがありません</p>
            <p className="text-sm mt-1">「+ 新規プロジェクト」から作成してください</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => {
              const stat = getProjectStatus(p)
              const now = new Date()
              const overdueCount = p.stages.filter(
                (s: Stage) => s.status !== 'completed' && new Date(s.deadline) < now
              ).length
              const doneCount = p.stages.filter((s: Stage) => s.status === 'completed').length
              const progress = p.stages.length > 0 ? (doneCount / p.stages.length) * 100 : 0

              return (
                <div key={p.id} className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden ${overdueCount > 0 ? 'border-red-200' : 'border-gray-200'}`}>
                  <div className={`h-1 ${overdueCount > 0 ? 'bg-red-500' : progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.max(progress, 3)}%` }} />
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <Link href={`/projects/${p.id}`}
                          className="font-semibold text-gray-900 hover:text-blue-600 transition-colors block truncate">
                          {p.name}
                        </Link>
                        {p.description && (
                          <p className="text-sm text-gray-400 mt-0.5 truncate">{p.description}</p>
                        )}
                      </div>
                      <button onClick={() => deleteProject(p.id)}
                        className="ml-2 text-gray-300 hover:text-red-400 text-sm flex-shrink-0">✕</button>
                    </div>

                    <div className={`mt-3 text-xs font-medium px-2 py-1 rounded-full inline-block ${stat.bg} ${stat.color}`}>
                      {stat.label}
                    </div>

                    {overdueCount > 0 && (
                      <div className="mt-2 text-xs text-red-600 font-semibold">
                        🔴 {overdueCount}件のステージが期限超過
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                      <span>{p.stages.length}ステージ</span>
                      <span>完了: {doneCount}/{p.stages.length}</span>
                      <span>作成: {new Date(p.createdAt).toLocaleDateString('ja-JP')}</span>
                    </div>

                    <Link href={`/projects/${p.id}`}
                      className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800 font-medium">
                      詳細を見る →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

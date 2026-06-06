'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import type { Project, Team, Stage } from '@/lib/types'
import StageTimeline from '@/components/StageTimeline'
import AddStageForm from '@/components/AddStageForm'

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [p, t] = await Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch('/api/teams').then((r) => r.json()),
    ])
    setProject(p)
    setTeams(t)
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
    if (!confirm('このステージを削除しますか？')) return
    await fetch(`/api/projects/${id}/stages/${stageId}`, { method: 'DELETE' })
    load()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">読み込み中...</div>
    </div>
  )

  if (!project || 'error' in project) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      プロジェクトが見つかりません
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← 戻る</Link>
            <span className="text-gray-300">|</span>
            <span className="text-2xl">🚦</span>
            <h1 className="text-lg font-bold text-gray-900 truncate">{project.name}</h1>
          </div>
          <Link href="/teams" className="text-sm text-gray-500 hover:text-gray-900">チーム管理</Link>
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
            <span className="text-gray-500">{totalStages}ステージ</span>
            <span className="text-green-600 font-medium">✓ 完了: {completedCount}</span>
            {overdueCount > 0 && (
              <span className="text-red-600 font-semibold">🔴 期限超過: {overdueCount}件</span>
            )}
            <span className="text-gray-400">
              作成: {new Date(project.createdAt).toLocaleDateString('ja-JP')}
            </span>
          </div>
        </div>

        {/* Teams used */}
        {project.stages.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {Array.from(new Set(project.stages.map((s) => s.teamId))).map((teamId) => {
              const team = teams.find((t) => t.id === teamId)
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
          <h2 className="font-semibold text-gray-900 mb-6">ステージタイムライン</h2>
          {teams.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p>チームが登録されていません。</p>
              <Link href="/teams" className="text-blue-600 text-sm hover:underline mt-1 inline-block">
                チーム管理でチームを追加 →
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
                onAdded={load}
              />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

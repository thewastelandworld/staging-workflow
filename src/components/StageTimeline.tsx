'use client'

import { useState } from 'react'
import type { Project, Team, Stage, StageStatus } from '@/lib/types'
import StageStatusBadge from './StageStatusBadge'

interface Props {
  project: Project
  teams: Team[]
  onStageUpdate: (stageId: string, data: Partial<Stage>) => Promise<void>
  onStageDelete: (stageId: string) => Promise<void>
}

function isOverdue(stage: Stage): boolean {
  if (stage.status === 'completed') return false
  return new Date() > new Date(stage.deadline)
}

function getEffectiveStatus(stage: Stage): StageStatus {
  if (stage.status === 'completed') return 'completed'
  if (isOverdue(stage)) return 'overdue'
  return stage.status
}

function formatDeadline(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  const formatted = d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  if (diff < 0) return { formatted, warning: `${Math.abs(days)}日 超過`, color: 'text-red-600' }
  if (hours < 24) return { formatted, warning: `残り ${hours}時間`, color: 'text-orange-500' }
  return { formatted, warning: `残り ${days}日`, color: 'text-gray-500' }
}

export default function StageTimeline({ project, teams, onStageUpdate, onStageDelete }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [emailPreview, setEmailPreview] = useState<string | null>(null)

  const sorted = [...project.stages].sort((a, b) => a.order - b.order)

  async function handleComplete(stage: Stage) {
    setLoadingId(stage.id)
    const res = await fetch(`/api/projects/${project.id}/stages/${stage.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    const data = await res.json()
    if (data.emailResult?.previewUrl) {
      setEmailPreview(data.emailResult.previewUrl)
    }
    await onStageUpdate(stage.id, { status: 'completed' })
    setLoadingId(null)
  }

  async function handleStart(stage: Stage) {
    setLoadingId(stage.id)
    await onStageUpdate(stage.id, { status: 'in_progress' })
    setLoadingId(null)
  }

  return (
    <div className="relative">
      {emailPreview && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <span className="text-green-800 text-sm">✅ 次のチームへメールを送信しました</span>
          <a href={emailPreview} target="_blank" rel="noreferrer"
            className="text-xs text-blue-600 underline ml-4">
            プレビューを見る (Ethereal)
          </a>
          <button onClick={() => setEmailPreview(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {sorted.map((stage, index) => {
            const team = teams.find((t) => t.id === stage.teamId)
            const status = getEffectiveStatus(stage)
            const dl = formatDeadline(stage.deadline)
            const isActive = loadingId === stage.id

            const cardBorder =
              status === 'overdue' ? 'border-red-400 bg-red-50 shadow-red-100' :
              status === 'in_progress' ? 'border-blue-300 bg-blue-50 shadow-blue-100' :
              status === 'completed' ? 'border-green-300 bg-white' :
              'border-gray-200 bg-white'

            const dotColor =
              status === 'overdue' ? 'bg-red-500 ring-red-200' :
              status === 'in_progress' ? 'bg-blue-500 ring-blue-200' :
              status === 'completed' ? 'bg-green-500 ring-green-200' :
              'bg-gray-300 ring-gray-100'

            return (
              <div key={stage.id} className="relative pl-14">
                {/* Step dot */}
                <div className={`absolute left-3 top-4 w-6 h-6 rounded-full border-2 border-white ring-4 flex items-center justify-center text-white text-xs font-bold shadow ${dotColor}`}>
                  {status === 'completed' ? '✓' : index + 1}
                </div>

                <div className={`border rounded-xl p-4 shadow-sm transition-all duration-200 ${cardBorder}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{stage.name}</h3>
                      <StageStatusBadge status={status} />
                      {stage.emailSent && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                          📧 メール送信済
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onStageDelete(stage.id)}
                      className="text-gray-300 hover:text-red-400 text-sm transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  {stage.description && (
                    <p className="text-sm text-gray-500 mt-1">{stage.description}</p>
                  )}

                  {/* Meta */}
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    {team && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="font-medium text-gray-700">{team.name}</span>
                        <span className="text-gray-400">({team.members.length}名)</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400">締め切り: </span>
                      <span className="text-gray-700">{dl.formatted}</span>
                      <span className={`ml-1.5 text-xs font-medium ${dl.color}`}>({dl.warning})</span>
                    </div>
                    {stage.startedAt && (
                      <div className="text-gray-400 text-xs">
                        開始: {new Date(stage.startedAt).toLocaleDateString('ja-JP')}
                      </div>
                    )}
                    {stage.completedAt && (
                      <div className="text-gray-400 text-xs">
                        完了: {new Date(stage.completedAt).toLocaleDateString('ja-JP')}
                      </div>
                    )}
                  </div>

                  {/* Team members */}
                  {team && team.members.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {team.members.map((m) => (
                        <span key={m.id} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                          {m.name}{m.role ? ` · ${m.role}` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  {status !== 'completed' && (
                    <div className="mt-3 flex gap-2">
                      {status === 'pending' && (
                        <button
                          onClick={() => handleStart(stage)}
                          disabled={isActive}
                          className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {isActive ? '...' : '▶ 開始'}
                        </button>
                      )}
                      {(status === 'in_progress' || status === 'overdue') && (
                        <button
                          onClick={() => handleComplete(stage)}
                          disabled={isActive}
                          className="text-sm px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {isActive ? '送信中...' : '✓ 完了にする'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Overdue warning */}
                  {status === 'overdue' && (
                    <div className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1">
                      🔴 このステージは期限を超過しています！
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {sorted.length === 0 && (
            <div className="pl-14 py-8 text-center text-gray-400">
              ステージがまだありません。下のフォームから追加してください。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

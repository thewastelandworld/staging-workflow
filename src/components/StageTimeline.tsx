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

interface EditForm {
  name: string
  description: string
  teamId: string
  deadline: string
  order: number
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

// Convert ISO/datetime-local to datetime-local input value
function toDatetimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function StageTimeline({ project, teams, onStageUpdate, onStageDelete }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [emailPreview, setEmailPreview] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  const sorted = [...project.stages].sort((a, b) => a.order - b.order)

  function startEdit(stage: Stage) {
    setEditingId(stage.id)
    setEditForm({
      name: stage.name,
      description: stage.description ?? '',
      teamId: stage.teamId,
      deadline: toDatetimeLocal(stage.deadline),
      order: stage.order,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
  }

  async function saveEdit(stage: Stage) {
    if (!editForm) return
    setSaving(true)
    await onStageUpdate(stage.id, {
      name: editForm.name,
      description: editForm.description,
      teamId: editForm.teamId,
      deadline: new Date(editForm.deadline).toISOString(),
      order: editForm.order,
    })
    setSaving(false)
    setEditingId(null)
    setEditForm(null)
  }

  async function handleComplete(stage: Stage) {
    setLoadingId(stage.id)
    const res = await fetch(`/api/projects/${project.id}/stages/${stage.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    const data = await res.json()
    if (data.emailResult?.previewUrl) setEmailPreview(data.emailResult.previewUrl)
    await onStageUpdate(stage.id, { status: 'completed' })
    setLoadingId(null)
  }

  async function handleStart(stage: Stage) {
    setLoadingId(stage.id)
    await onStageUpdate(stage.id, { status: 'in_progress' })
    setLoadingId(null)
  }

  async function handleRestart(stage: Stage) {
    if (!confirm(`「${stage.name}」を再開しますか？\n完了状態がリセットされ、進行中に戻ります。`)) return
    setLoadingId(stage.id)
    await onStageUpdate(stage.id, {
      status: 'in_progress',
      completedAt: undefined,
      emailSent: false,
    })
    setLoadingId(null)
  }

  const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'

  return (
    <div className="relative">
      {emailPreview && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <span className="text-green-800 text-sm">✅ 次のチームへメールを送信しました</span>
          <a href={emailPreview} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline ml-4">
            プレビューを見る (Ethereal)
          </a>
          <button onClick={() => setEmailPreview(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {sorted.map((stage, index) => {
            const team = teams.find((t) => t.id === stage.teamId)
            const status = getEffectiveStatus(stage)
            const dl = formatDeadline(stage.deadline)
            const isActive = loadingId === stage.id
            const isEditing = editingId === stage.id

            const cardBorder =
              isEditing ? 'border-yellow-400 bg-yellow-50 shadow-yellow-100' :
              status === 'overdue' ? 'border-red-400 bg-red-50 shadow-red-100' :
              status === 'in_progress' ? 'border-blue-300 bg-blue-50 shadow-blue-100' :
              status === 'completed' ? 'border-green-300 bg-white' :
              'border-gray-200 bg-white'

            const dotColor =
              isEditing ? 'bg-yellow-400 ring-yellow-200' :
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
                  {isEditing && editForm ? (
                    /* ── EDIT MODE ── */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">✏️ 編集中</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">ステージ名 *</label>
                          <input className={inputCls} value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">順番</label>
                          <input type="number" className={inputCls} value={editForm.order} min={1}
                            onChange={(e) => setEditForm({ ...editForm, order: Number(e.target.value) })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">説明</label>
                        <input className={inputCls} value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="任意" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">担当チーム *</label>
                          <select className={inputCls} value={editForm.teamId}
                            onChange={(e) => setEditForm({ ...editForm, teamId: e.target.value })}>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">締め切り *</label>
                          <input type="datetime-local" className={inputCls} value={editForm.deadline}
                            onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveEdit(stage)} disabled={saving || !editForm.name}
                          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {saving ? '保存中...' : '💾 保存'}
                        </button>
                        <button onClick={cancelEdit}
                          className="px-4 py-1.5 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── VIEW MODE ── */
                    <>
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
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(stage)}
                            className="text-xs px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors">
                            ✏️ 編集
                          </button>
                          <button onClick={() => onStageDelete(stage.id)}
                            className="text-gray-300 hover:text-red-400 text-sm transition-colors">
                            ✕
                          </button>
                        </div>
                      </div>

                      {stage.description && (
                        <p className="text-sm text-gray-500 mt-1">{stage.description}</p>
                      )}

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

                      {team && team.members.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {team.members.map((m) => (
                            <span key={m.id} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                              {m.name}{m.role ? ` · ${m.role}` : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex gap-2 flex-wrap">
                        {status === 'pending' && (
                          <button onClick={() => handleStart(stage)} disabled={isActive}
                            className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {isActive ? '...' : '▶ 開始'}
                          </button>
                        )}
                        {(status === 'in_progress' || status === 'overdue') && (
                          <button onClick={() => handleComplete(stage)} disabled={isActive}
                            className="text-sm px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                            {isActive ? '送信中...' : '✓ 完了にする'}
                          </button>
                        )}
                        {status === 'completed' && (
                          <button onClick={() => handleRestart(stage)} disabled={isActive}
                            className="text-sm px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                            {isActive ? '...' : '🔄 やり直す'}
                          </button>
                        )}
                      </div>

                      {status === 'overdue' && (
                        <div className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1">
                          🔴 このステージは期限を超過しています！
                        </div>
                      )}
                    </>
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

'use client'

import { useState } from 'react'
import type { Project, Team, Stage, StageStatus } from '@/lib/types'
import StageStatusBadge from './StageStatusBadge'
import { useLanguage } from './LanguageProvider'

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
  const { t } = useLanguage()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [checkingKey, setCheckingKey] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [emailPreview, setEmailPreview] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editReviewers, setEditReviewers] = useState<{ teamId: string; checkContent: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [problemEditId, setProblemEditId] = useState<string | null>(null)
  const [problemDraft, setProblemDraft] = useState<Record<string, string>>({})

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
    setEditReviewers(
      (stage.reviewers ?? []).sort((a, b) => a.order - b.order).map((r) => ({
        teamId: r.teamId,
        checkContent: r.checkContent ?? '',
      }))
    )
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
    setEditReviewers([])
  }

  function addEditReviewer(teamId: string) {
    if (!teamId || editReviewers.some((r) => r.teamId === teamId)) return
    setEditReviewers([...editReviewers, { teamId, checkContent: '' }])
  }

  function removeEditReviewer(teamId: string) {
    setEditReviewers(editReviewers.filter((r) => r.teamId !== teamId))
  }

  function updateEditCheckContent(teamId: string, checkContent: string) {
    setEditReviewers(editReviewers.map((r) => r.teamId === teamId ? { ...r, checkContent } : r))
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
      reviewers: editReviewers.map((r, i) => ({
        teamId: r.teamId,
        order: i + 1,
        checkContent: r.checkContent,
        checkedAt: stage.reviewers?.find((sr) => sr.teamId === r.teamId)?.checkedAt,
        note: stage.reviewers?.find((sr) => sr.teamId === r.teamId)?.note,
      })),
    })
    setSaving(false)
    setEditingId(null)
    setEditForm(null)
    setEditReviewers([])
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
    if (!confirm(t.restartConfirm(stage.name))) return
    setLoadingId(stage.id)
    await onStageUpdate(stage.id, {
      status: 'in_progress',
      completedAt: undefined,
      emailSent: false,
      problem: '',
    })
    setLoadingId(null)
  }

  async function saveProblem(stageId: string) {
    const text = (problemDraft[stageId] ?? '').trim()
    await onStageUpdate(stageId, { problem: text })
    setProblemEditId(null)
  }

  function openProblemEdit(stage: Stage) {
    setProblemDraft((prev) => ({ ...prev, [stage.id]: stage.problem ?? '' }))
    setProblemEditId(stage.id)
  }

  async function handleReviewerCheck(stage: Stage, teamId: string) {
    const key = `${stage.id}:${teamId}`
    setCheckingKey(key)
    const note = reviewNotes[key] ?? ''
    const res = await fetch(`/api/projects/${project.id}/stages/${stage.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerCheck: { teamId, note } }),
    })
    const data = await res.json()
    if (data.emailResult?.previewUrl) setEmailPreview(data.emailResult.previewUrl)
    await onStageUpdate(stage.id, {})
    setReviewNotes((prev) => { const n = { ...prev }; delete n[key]; return n })
    setCheckingKey(null)
  }

  const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'

  return (
    <div className="relative">
      {emailPreview && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <span className="text-green-800 text-sm">{t.emailPreviewMsg}</span>
          <a href={emailPreview} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline ml-4">
            {t.emailPreviewLink}
          </a>
          <button onClick={() => setEmailPreview(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      <div className="relative">
        <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-4">
          {sorted.map((stage, index) => {
            const team = teams.find((t) => t.id === stage.teamId)
            const status = getEffectiveStatus(stage)
            const dl = formatDeadline(stage.deadline)
            const isActive = loadingId === stage.id
            const isEditing = editingId === stage.id

            const hasProblem = !!stage.problem && status !== 'completed'

            const cardBorder =
              isEditing ? 'border-yellow-400 bg-yellow-50 shadow-yellow-100' :
              hasProblem ? 'border-red-500 bg-red-50 shadow-red-100' :
              status === 'overdue' ? 'border-red-400 bg-red-50 shadow-red-100' :
              status === 'in_progress' ? 'border-blue-300 bg-blue-50 shadow-blue-100' :
              status === 'completed' ? 'border-green-300 bg-white' :
              'border-gray-200 bg-white'

            const dotColor =
              isEditing ? 'bg-yellow-400 ring-yellow-200' :
              hasProblem ? 'bg-red-600 ring-red-300' :
              status === 'overdue' ? 'bg-red-500 ring-red-200' :
              status === 'in_progress' ? 'bg-blue-500 ring-blue-200' :
              status === 'completed' ? 'bg-green-500 ring-green-200' :
              'bg-gray-300 ring-gray-100'

            return (
              <div key={stage.id} className="relative pl-10 sm:pl-14">
                {/* Step dot */}
                <div className={`absolute left-1.5 sm:left-3 top-4 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white ring-4 flex items-center justify-center text-white text-xs font-bold shadow ${dotColor}`}>
                  {status === 'completed' ? '✓' : index + 1}
                </div>

                <div className={`border rounded-xl p-4 shadow-sm transition-all duration-200 ${cardBorder}`}>
                  {isEditing && editForm ? (
                    /* ── EDIT MODE ── */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded">{t.editingBadge}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">{t.stageName}</label>
                          <input className={inputCls} value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">{t.order}</label>
                          <input type="number" className={inputCls} value={editForm.order} min={1}
                            onChange={(e) => setEditForm({ ...editForm, order: Number(e.target.value) })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">{t.description}</label>
                        <textarea className={inputCls} value={editForm.description} rows={3}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">{t.teams} *</label>
                          <select className={inputCls} value={editForm.teamId}
                            onChange={(e) => setEditForm({ ...editForm, teamId: e.target.value })}>
                            {teams.map((tm) => (
                              <option key={tm.id} value={tm.id}>{tm.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">{t.deadline} *</label>
                          <input type="datetime-local" className={inputCls} value={editForm.deadline}
                            onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">{t.reviewerTeamsLabel}</label>
                        <select className={inputCls + ' mb-2'} defaultValue=""
                          onChange={(e) => { addEditReviewer(e.target.value); e.target.value = '' }}>
                          <option value="">{t.addTeamOption}</option>
                          {teams.filter((tm) => !editReviewers.some((r) => r.teamId === tm.id)).map((tm) => (
                            <option key={tm.id} value={tm.id}>{tm.name}</option>
                          ))}
                        </select>
                        {editReviewers.length > 0 && (
                          <div className="space-y-2">
                            {editReviewers.map((reviewer, i) => {
                              const reviewerTeam = teams.find((tm) => tm.id === reviewer.teamId)
                              const alreadyChecked = !!stage.reviewers?.find((sr) => sr.teamId === reviewer.teamId)?.checkedAt
                              return (
                                <div key={reviewer.teamId} className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-400 text-xs w-4">{i + 1}.</span>
                                    <span className="flex-1 text-sm text-gray-700 font-medium">{reviewerTeam?.name}</span>
                                    {alreadyChecked && (
                                      <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{t.alreadyChecked}</span>
                                    )}
                                    {!alreadyChecked && (
                                      <button type="button" onClick={() => removeEditReviewer(reviewer.teamId)}
                                        className="text-gray-300 hover:text-red-400 transition-colors">✕</button>
                                    )}
                                  </div>
                                  <textarea
                                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    rows={3} placeholder={t.checkContentPlaceholder}
                                    value={reviewer.checkContent}
                                    onChange={(e) => updateEditCheckContent(reviewer.teamId, e.target.value)}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveEdit(stage)} disabled={saving || !editForm.name}
                          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {saving ? t.saving : t.save}
                        </button>
                        <button onClick={cancelEdit}
                          className="px-4 py-1.5 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                          {t.cancel}
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
                          {status !== 'completed' && !stage.problem && problemEditId !== stage.id && (
                            <button
                              onClick={() => openProblemEdit(stage)}
                              className="text-xs px-2 py-0.5 bg-red-50 text-red-600 border border-red-300 rounded-full hover:bg-red-100 transition-colors"
                            >
                              {t.reportProblem}
                            </button>
                          )}
                          {stage.emailSent && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                              {t.emailSentBadge}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(stage)}
                            className="text-xs px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors">
                            {t.edit}
                          </button>
                          <button onClick={() => onStageDelete(stage.id)}
                            className="text-gray-300 hover:text-red-400 text-sm transition-colors">
                            ✕
                          </button>
                        </div>
                      </div>

                      {stage.description && (
                        <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{stage.description}</p>
                      )}

                      {/* Problem display / input */}
                      {stage.problem && problemEditId !== stage.id && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <span className="text-xs font-semibold text-red-700">{t.problemLabel}</span>
                              <p className="text-sm text-red-800 mt-0.5 whitespace-pre-wrap">{stage.problem}</p>
                            </div>
                            {status !== 'completed' && (
                              <div className="flex flex-col gap-1 flex-shrink-0">
                                <button
                                  onClick={() => openProblemEdit(stage)}
                                  className="text-xs px-2 py-0.5 text-red-600 border border-red-300 rounded hover:bg-red-100 transition-colors"
                                >
                                  {t.editProblem}
                                </button>
                                <button
                                  onClick={() => onStageUpdate(stage.id, { problem: '' })}
                                  className="text-xs px-2 py-0.5 text-green-700 border border-green-300 rounded hover:bg-green-50 transition-colors"
                                >
                                  {t.resolveProblem}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Problem edit form */}
                      {problemEditId === stage.id && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg space-y-2">
                          <span className="text-xs font-semibold text-red-700">{t.problemLabel}</span>
                          <textarea
                            className="w-full px-2 py-1.5 border border-red-300 rounded text-sm text-black focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white"
                            rows={3}
                            placeholder={t.problemPlaceholder}
                            value={problemDraft[stage.id] ?? ''}
                            onChange={(e) => setProblemDraft((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveProblem(stage.id)}
                              className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                            >
                              {t.saveProblem}
                            </button>
                            <button
                              onClick={() => setProblemEditId(null)}
                              className="text-xs px-3 py-1 bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                            >
                              {t.cancel}
                            </button>
                          </div>
                        </div>
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

                      {/* Reviewer checklist */}
                      {stage.reviewers && stage.reviewers.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="text-xs font-medium text-gray-500 mb-2">{t.reviewersLabel}</div>
                          <div className="space-y-1">
                            {[...stage.reviewers].sort((a, b) => a.order - b.order).map((reviewer, ri) => {
                              const reviewerTeam = teams.find((tm) => tm.id === reviewer.teamId)
                              const prevChecked = stage.reviewers!.slice(0, ri).every((r) => r.checkedAt)
                              const isActiveReviewer = !reviewer.checkedAt && prevChecked
                              const isDone = !!reviewer.checkedAt
                              const key = `${stage.id}:${reviewer.teamId}`
                              return (
                                <div key={reviewer.teamId} className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm w-4 text-center flex-shrink-0 ${isDone ? 'text-green-500' : isActiveReviewer ? 'text-blue-500' : 'text-gray-300'}`}>
                                      {isDone ? '✓' : isActiveReviewer ? '→' : '○'}
                                    </span>
                                    <span className={`text-sm flex-1 ${isDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                      {reviewerTeam?.name ?? reviewer.teamId}
                                    </span>
                                    {isDone && reviewer.checkedAt && (
                                      <span className="text-xs text-gray-400">
                                        {new Date(reviewer.checkedAt).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  {isDone && reviewer.checkContent && (
                                    <div className="ml-6 px-2 py-1.5 bg-gray-50 border border-gray-100 rounded text-xs text-gray-500 whitespace-pre-wrap">
                                      <span className="font-medium text-gray-400">{t.checkContentLabel}: </span>{reviewer.checkContent}
                                    </div>
                                  )}
                                  {isDone && reviewer.note && (
                                    <div className="ml-6 px-2 py-1.5 bg-green-50 border border-green-100 rounded text-xs text-gray-600 whitespace-pre-wrap">
                                      <span className="font-medium text-green-700">{t.reviewNoteLabel}: </span>{reviewer.note}
                                    </div>
                                  )}
                                  {isActiveReviewer && (status === 'in_progress' || status === 'overdue') && (
                                    <div className="ml-6 space-y-1.5">
                                      {reviewer.checkContent && (
                                        <div className="px-2 py-1.5 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800 whitespace-pre-wrap">
                                          <span className="font-medium">{t.checkContentLabel}: </span>{reviewer.checkContent}
                                        </div>
                                      )}
                                      <textarea
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-black focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                                        rows={2} placeholder={t.reviewNotePlaceholder}
                                        value={reviewNotes[key] ?? ''}
                                        onChange={(e) => setReviewNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                                      />
                                      <button
                                        onClick={() => handleReviewerCheck(stage, reviewer.teamId)}
                                        disabled={checkingKey === key}
                                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                      >
                                        {checkingKey === key ? '...' : t.confirmBtn}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex gap-2 flex-wrap">
                        {status === 'pending' && (
                          <button onClick={() => handleStart(stage)} disabled={isActive}
                            className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {isActive ? '...' : t.start}
                          </button>
                        )}
                        {(status === 'in_progress' || status === 'overdue') && (() => {
                          const allReviewersDone = !stage.reviewers || stage.reviewers.length === 0 || stage.reviewers.every((r) => r.checkedAt)
                          return allReviewersDone ? (
                            <button onClick={() => handleComplete(stage)} disabled={isActive}
                              className="text-sm px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                              {isActive ? t.completing : t.complete}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 py-1">{t.waitingApproval}</span>
                          )
                        })()}
                        {status === 'completed' && (
                          <button onClick={() => handleRestart(stage)} disabled={isActive}
                            className="text-sm px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                            {isActive ? '...' : t.restart}
                          </button>
                        )}
                      </div>

                      {status === 'overdue' && (
                        <div className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1">
                          {t.overdueWarning}
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
              {t.noStagesYet}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

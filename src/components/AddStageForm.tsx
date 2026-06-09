'use client'

import { useState } from 'react'
import type { Team, Stage } from '@/lib/types'
import { useLanguage } from './LanguageProvider'

interface Props {
  projectId: string
  teams: Team[]
  nextOrder: number
  existingStages?: Stage[]
  onAdded: () => void
}

function todayDatetimeLocal() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AddStageForm({ projectId, teams, nextOrder, existingStages = [], onAdded }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    teamId: teams[0]?.id ?? '',
    deadline: todayDatetimeLocal(),
    order: nextOrder,
  })
  const [reviewers, setReviewers] = useState<{ teamId: string; checkContent: string }[]>([])

  function copyFrom(stageId: string) {
    if (!stageId) return
    const src = existingStages.find((s) => s.id === stageId)
    if (!src) return
    setForm({
      name: src.name + ' (copy)',
      description: src.description ?? '',
      teamId: src.teamId,
      deadline: '',
      order: nextOrder,
    })
    setReviewers(
      (src.reviewers ?? []).sort((a, b) => a.order - b.order).map((r) => ({
        teamId: r.teamId,
        checkContent: r.checkContent ?? '',
      }))
    )
  }

  function addReviewer(teamId: string) {
    if (!teamId || reviewers.some((r) => r.teamId === teamId)) return
    setReviewers([...reviewers, { teamId, checkContent: '' }])
  }

  function removeReviewer(teamId: string) {
    setReviewers(reviewers.filter((r) => r.teamId !== teamId))
  }

  function updateCheckContent(teamId: string, checkContent: string) {
    setReviewers(reviewers.map((r) => r.teamId === teamId ? { ...r, checkContent } : r))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.teamId || !form.deadline) return
    setLoading(true)
    await fetch(`/api/projects/${projectId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        reviewers: reviewers.map((r, i) => ({ teamId: r.teamId, order: i + 1, checkContent: r.checkContent })),
      }),
    })
    setLoading(false)
    setOpen(false)
    setForm({ name: '', description: '', teamId: teams[0]?.id ?? '', deadline: todayDatetimeLocal(), order: nextOrder + 1 })
    setReviewers([])
    onAdded()
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
      >
        {t.addStageBtn}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 p-4 border border-blue-200 rounded-xl bg-blue-50">
      <h3 className="font-semibold text-gray-800 mb-3">{t.newStage}</h3>

      {existingStages.length > 0 && (
        <div className="mb-4 p-3 bg-white border border-blue-100 rounded-lg">
          <label className="text-xs font-medium text-gray-600 block mb-1.5">{t.copyFromExisting}</label>
          <select className={inputCls + ' bg-white'} defaultValue="" onChange={(e) => copyFrom(e.target.value)}>
            <option value="">{t.copySelectPlaceholder}</option>
            {[...existingStages].sort((a, b) => a.order - b.order).map((s) => {
              const team = teams.find((tt) => tt.id === s.teamId)
              return (
                <option key={s.id} value={s.id}>
                  {s.order}. {s.name}{team ? ` (${team.name})` : ''}
                </option>
              )
            })}
          </select>
          <p className="text-xs text-gray-400 mt-1">{t.copyHint}</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t.stageName}</label>
            <input className={inputCls} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t.stageNamePlaceholder} required />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t.order}</label>
            <input type="number" className={inputCls} value={form.order} min={1}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">{t.description}</label>
          <input className={inputCls} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t.teamManagement.replace('管理', '')} *</label>
            <select className={inputCls + ' bg-white'} value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })} required>
              <option value=""></option>
              {teams.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{t.deadline} *</label>
            <input type="datetime-local" className={inputCls} value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">{t.reviewerTeamsLabel}</label>
          <select className={inputCls + ' bg-white mb-2'} defaultValue=""
            onChange={(e) => { addReviewer(e.target.value); e.target.value = '' }}>
            <option value="">{t.addTeamOption}</option>
            {teams.filter((tt) => !reviewers.some((r) => r.teamId === tt.id)).map((tt) => (
              <option key={tt.id} value={tt.id}>{tt.name}</option>
            ))}
          </select>
          {reviewers.length > 0 && (
            <div className="space-y-2">
              {reviewers.map((reviewer, i) => {
                const team = teams.find((tt) => tt.id === reviewer.teamId)
                return (
                  <div key={reviewer.teamId} className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-4">{i + 1}.</span>
                      <span className="flex-1 text-sm text-gray-700 font-medium">{team?.name}</span>
                      <button type="button" onClick={() => removeReviewer(reviewer.teamId)}
                        className="text-gray-300 hover:text-red-400 transition-colors">✕</button>
                    </div>
                    <textarea
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-black focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      rows={2} placeholder={t.checkContentPlaceholder}
                      value={reviewer.checkContent}
                      onChange={(e) => updateCheckContent(reviewer.teamId, e.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? t.adding : t.add}
          </button>
          <button type="button" onClick={() => setOpen(false)}
            className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            {t.cancel}
          </button>
        </div>
      </div>
    </form>
  )
}

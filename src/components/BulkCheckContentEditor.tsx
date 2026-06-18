'use client'

import { useState, useMemo } from 'react'
import type { Stage, Team } from '@/lib/types'
import { useLanguage } from './LanguageProvider'

interface Props {
  projectId: string
  stages: Stage[]
  teams: Team[]
  onSaved: () => void
}

export default function BulkCheckContentEditor({ projectId, stages, teams, onSaved }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [applyAllText, setApplyAllText] = useState('')
  const [contents, setContents] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [doneCount, setDoneCount] = useState<number | null>(null)

  // 待機中・進行中ステージで確認チームを持つもの
  const pendingStages = useMemo(
    () => stages.filter((s) => (s.status === 'pending' || s.status === 'in_progress') && (s.reviewers ?? []).length > 0),
    [stages]
  )

  // 確認チームとして登場するチームの一覧
  const reviewerTeams = useMemo(() => {
    const ids = new Set(pendingStages.flatMap((s) => (s.reviewers ?? []).map((r) => r.teamId)))
    return teams.filter((t) => ids.has(t.id))
  }, [pendingStages, teams])

  // 選択チームが確認チームに含まれる待機中ステージ
  const targetStages = useMemo(
    () => pendingStages.filter((s) => (s.reviewers ?? []).some((r) => r.teamId === selectedTeamId)),
    [pendingStages, selectedTeamId]
  )

  function openEditor() {
    setSelectedTeamId(reviewerTeams[0]?.id ?? '')
    setContents({})
    setApplyAllText('')
    setDoneCount(null)
    setOpen(true)
  }

  function onSelectTeam(teamId: string) {
    setSelectedTeamId(teamId)
    setContents({})
    setApplyAllText('')
    setDoneCount(null)
  }

  function applyToAll() {
    const next: Record<string, string> = {}
    targetStages.forEach((s) => { next[s.id] = applyAllText })
    setContents(next)
  }

  const changedStages = useMemo(
    () => targetStages.filter((stage) => {
      const current = (stage.reviewers ?? []).find((r) => r.teamId === selectedTeamId)?.checkContent ?? ''
      return (contents[stage.id] ?? current) !== current
    }),
    [targetStages, selectedTeamId, contents]
  )

  async function save() {
    if (changedStages.length === 0) return
    setSaving(true)
    setDoneCount(null)
    for (const stage of changedStages) {
      const updatedReviewers = (stage.reviewers ?? []).map((r) =>
        r.teamId === selectedTeamId ? { ...r, checkContent: contents[stage.id] } : r
      )
      await fetch(`/api/projects/${projectId}/stages/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewers: updatedReviewers }),
      })
    }
    setSaving(false)
    setDoneCount(changedStages.length)
    onSaved()
  }

  if (reviewerTeams.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
      >
        ✏️ {t.bulkEditBtn}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{t.bulkEditBtn}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* チーム選択 */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t.bulkEditSelectTeam}</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  value={selectedTeamId}
                  onChange={(e) => onSelectTeam(e.target.value)}
                >
                  {reviewerTeams.map((tm) => (
                    <option key={tm.id} value={tm.id}>{tm.name}</option>
                  ))}
                </select>
              </div>

              {targetStages.length === 0 ? (
                <p className="text-sm text-gray-400">{t.bulkEditNoPending}</p>
              ) : (
                <>
                  {/* 全ステージに一括適用 */}
                  <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <label className="text-xs text-gray-500">{t.bulkEditApplyAllLabel}</label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                      rows={3}
                      value={applyAllText}
                      onChange={(e) => setApplyAllText(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={applyToAll}
                      disabled={!applyAllText.trim()}
                      className="text-xs px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {t.bulkEditApplyAllBtn}
                    </button>
                  </div>

                  {/* ステージごと個別編集 */}
                  <div className="space-y-3">
                    {targetStages.map((stage) => {
                      const current = (stage.reviewers ?? []).find((r) => r.teamId === selectedTeamId)?.checkContent ?? ''
                      const value = contents[stage.id] ?? current
                      const changed = value !== current
                      return (
                        <div key={stage.id} className={`rounded-lg border p-3 space-y-1.5 ${changed ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">{stage.order}. {stage.name}</span>
                            {changed && <span className="text-xs text-blue-500">変更あり</span>}
                          </div>
                          <textarea
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                            rows={3}
                            value={value}
                            onChange={(e) => setContents((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                          />
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {doneCount !== null && (
                <p className="text-sm text-green-600 font-medium">{t.bulkEditDone(doneCount)}</p>
              )}
            </div>

            {/* Footer */}
            {targetStages.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || changedStages.length === 0}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {saving ? t.bulkEditSaving : t.bulkEditSaveBtn(changedStages.length)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

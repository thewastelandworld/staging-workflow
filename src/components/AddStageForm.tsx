'use client'

import { useState } from 'react'
import type { Team } from '@/lib/types'

interface Props {
  projectId: string
  teams: Team[]
  nextOrder: number
  onAdded: () => void
}

export default function AddStageForm({ projectId, teams, nextOrder, onAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    teamId: teams[0]?.id ?? '',
    deadline: '',
    order: nextOrder,
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.teamId || !form.deadline) return
    setLoading(true)
    await fetch(`/api/projects/${projectId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    setOpen(false)
    setForm({ name: '', description: '', teamId: teams[0]?.id ?? '', deadline: '', order: nextOrder + 1 })
    onAdded()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
      >
        + ステージを追加
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 p-4 border border-blue-200 rounded-xl bg-blue-50">
      <h3 className="font-semibold text-gray-800 mb-3">新しいステージ</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">ステージ名 *</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: デザインレビュー"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">順番</label>
            <input
              type="number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.order}
              onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
              min={1}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">説明</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="任意"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">担当チーム *</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              required
            >
              <option value="">選択してください</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">締め切り *</label>
            <input
              type="datetime-local"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '追加中...' : '追加'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </form>
  )
}

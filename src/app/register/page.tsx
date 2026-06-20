'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Team } from '@/lib/types'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [teamId, setTeamId] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [teamsError, setTeamsError] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function loadTeams() {
    setTeamsLoading(true)
    setTeamsError(false)
    try {
      const r = await fetch('/api/teams')
      if (!r.ok) {
        setTeamsError(true)
        return
      }
      const data = await r.json()
      setTeams(Array.isArray(data) ? data : [])
    } catch {
      setTeamsError(true)
    } finally {
      setTeamsLoading(false)
    }
  }

  useEffect(() => { loadTeams() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }

    if (!teamId) {
      setError('チームを選択してください')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, email, password, teamId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '登録に失敗しました')
        return
      }
      setDone(true)
    } catch {
      setError('登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function renderTeamField() {
    if (teamsLoading) {
      return (
        <div className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-400 bg-gray-50">
          読み込み中...
        </div>
      )
    }
    if (teamsError) {
      return (
        <div className="space-y-1">
          <div className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm text-red-500 bg-red-50">
            チームの取得に失敗しました
          </div>
          <button
            type="button"
            onClick={loadTeams}
            className="text-xs text-blue-500 hover:underline"
          >
            再試行
          </button>
        </div>
      )
    }
    if (teams.length === 0) {
      return (
        <div className="space-y-1">
          <div className="w-full px-3 py-2 border border-yellow-200 rounded-lg text-sm text-yellow-700 bg-yellow-50">
            チームがまだ登録されていません
          </div>
          <p className="text-xs text-gray-400">
            管理者が<Link href="/login" className="text-blue-500 hover:underline">ログイン</Link>してチームを作成してから登録してください。
          </p>
        </div>
      )
    }
    return (
      <select
        required
        value={teamId}
        onChange={e => setTeamId(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      >
        <option value="">— チームを選択してください —</option>
        {teams.map(t => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🚦</span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Staging Workflow</h1>
          <p className="mt-1 text-sm text-gray-500">新規アカウント登録</p>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center space-y-4">
            <p className="text-green-600 font-medium">登録が完了しました</p>
            <p className="text-sm text-gray-500">ログインページからサインインしてください。</p>
            <Link
              href="/login"
              className="block w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors text-center"
            >
              ログインへ
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="3〜32文字 英数字/_/-"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">表示名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span className="text-red-500">*</span></label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード <span className="text-red-500">*</span></label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="8文字以上"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（確認） <span className="text-red-500">*</span></label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                チーム <span className="text-red-500">*</span>
              </label>
              {renderTeamField()}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || teamsLoading || teamsError || teams.length === 0}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? '登録中...' : 'アカウントを作成'}
            </button>

            <p className="text-xs text-center text-gray-400">
              すでにアカウントをお持ちですか？{' '}
              <Link href="/login" className="text-blue-500 hover:underline">
                ログイン
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

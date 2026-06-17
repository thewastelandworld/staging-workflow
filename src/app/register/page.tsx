'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
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
              <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（確認）</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
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

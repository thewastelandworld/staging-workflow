'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from '@/components/SessionProvider'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const { session, loading: sessionLoading } = useSession()
  const router = useRouter()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.replace('/login')
    }
  }, [session, sessionLoading, router])

  useEffect(() => {
    if (sessionLoading) return
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setDisplayName(data.displayName ?? '')
          setEmail(data.email ?? '')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sessionLoading])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '更新に失敗しました')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
              <span className="text-xl">🚦</span>
              <span className="text-sm">Staging Workflow</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-900">プロフィール</span>
          </div>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← ダッシュボード</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-gray-900">プロフィール編集</h1>
            <p className="text-sm text-gray-400 mt-1">ユーザー名: <span className="font-medium text-gray-600">{session?.user}</span></p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                表示名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setSuccess(false) }}
                placeholder="山田 太郎"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => { setEmail(e.target.value); setSuccess(false) }}
                placeholder="example@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">プロフィールを更新しました</p>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

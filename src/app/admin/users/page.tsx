'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from '@/components/SessionProvider'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  username: string
  display_name: string | null
  email: string | null
  permission: 'admin' | 'team_leader' | 'user' | 'readonly'
  status: 'pending' | 'approved' | null
}

interface TeamInfo {
  id: string
  name: string
  color: string
}

const PERMISSION_LABEL: Record<string, string> = {
  admin: '管理員',
  team_leader: '使用者',
  user: '使用者',
  readonly: '使用者',
}

const PERMISSION_STYLE: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  team_leader: 'bg-green-100 text-green-700',
  user: 'bg-green-100 text-green-700',
  readonly: 'bg-green-100 text-green-700',
}

export default function AdminUsersPage() {
  const { session, loading: sessionLoading } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [userTeams, setUserTeams] = useState<Record<string, TeamInfo[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionLoading && session?.permission !== 'admin') router.replace('/')
  }, [session, sessionLoading, router])

  async function load() {
    setLoading(true)
    const [usersRes, teamsRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/teams'),
    ])
    if (usersRes.ok) {
      const usersData: User[] = await usersRes.json()
      setUsers(usersData)
      if (teamsRes.ok) {
        const teamsData: { id: string; name: string; color: string; members: { id: string }[] }[] = await teamsRes.json()
        const map: Record<string, TeamInfo[]> = {}
        for (const team of teamsData) {
          for (const member of team.members) {
            if (!map[member.id]) map[member.id] = []
            map[member.id].push({ id: team.id, name: team.name, color: team.color })
          }
        }
        setUserTeams(map)
      }
    } else {
      setError('ユーザー一覧の取得に失敗しました')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!sessionLoading && session?.permission === 'admin') load()
  }, [session, sessionLoading])

  async function approveUser(user: User) {
    setBusy(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve: true }),
    })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? '承認に失敗しました')
    } else {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: 'approved' } : u))
    }
    setBusy(null)
  }

  async function deleteUser(user: User) {
    if (!confirm(`「${user.username}」を削除しますか？`)) return
    setBusy(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? '削除に失敗しました')
      setBusy(null)
    } else {
      setUsers(prev => prev.filter(u => u.id !== user.id))
      setBusy(null)
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">読み込み中...</div>
      </div>
    )
  }

  const pending  = users.filter(u => u.status === 'pending')
  const approved = users.filter(u => u.status !== 'pending')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
              <span className="text-xl">🚦</span>
              <span className="text-sm">Staging Workflow</span>
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-900">ユーザー管理</span>
          </div>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← ダッシュボード</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        {/* Pending approval section */}
        {pending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-semibold text-gray-900">承認待ち</h2>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">{pending.length} 名</span>
            </div>
            <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-orange-50 border-b border-orange-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-medium">ユーザー</th>
                    <th className="text-left px-5 py-3 font-medium">メール</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pending.map(user => {
                    const isBusy = busy === user.id
                    return (
                      <tr key={user.id} className="hover:bg-orange-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">{user.display_name ?? user.username}</div>
                          <div className="text-xs text-gray-400 mt-0.5">@{user.username}</div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {user.email ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => approveUser(user)}
                              disabled={isBusy}
                              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                              {isBusy ? '処理中...' : '承認'}
                            </button>
                            <button
                              onClick={() => deleteUser(user)}
                              disabled={isBusy}
                              className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              拒否
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Approved users section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">承認済みユーザー</h2>
            <span className="text-sm text-gray-400">{approved.length} 名</span>
          </div>

          <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
            権限は <span className="font-medium text-green-700">使用者</span> のみ設定できます。<span className="font-medium text-blue-700">管理員</span> への変更はできません。チームリーダーの指定はチーム管理画面から行ってください。
          </div>

          {approved.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">👤</div>
              <p className="text-sm">承認済みユーザーがいません</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-medium">ユーザー</th>
                    <th className="text-left px-5 py-3 font-medium">メール</th>
                    <th className="text-left px-5 py-3 font-medium w-64">所属チーム</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {approved.map(user => {
                    const isSelf = user.username === session?.user
                    const isBusy = busy === user.id
                    const teams = userTeams[user.id] ?? []

                    return (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">
                            {user.display_name ?? user.username}
                            {isSelf && <span className="ml-2 text-xs text-blue-500 font-normal">（自分）</span>}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">@{user.username}</div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500">
                          {user.email ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          {teams.length === 0 ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {teams.map(team => (
                                <span key={team.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-full text-gray-600">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                                  {team.name}
                                  {user.permission === 'team_leader' && (
                                    <span className="text-purple-500 font-medium">★</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => deleteUser(user)}
                            disabled={isSelf || isBusy}
                            className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Team } from '@/lib/types'
import { useDarkMode } from '@/components/DarkModeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { useSession } from '@/components/SessionProvider'
import { LOCALES, type Locale } from '@/lib/i18n'

interface UserOption {
  id: string
  username: string
  display_name: string | null
  email: string | null
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

export default function TeamsPage() {
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { t, locale, setLocale } = useLanguage()
  const { session, loading: sessionLoading, logout } = useSession()
  const isReadOnly = !sessionLoading && session?.permission === 'readonly'
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  const [teamName, setTeamName] = useState('')
  const [teamColor, setTeamColor] = useState(COLORS[0])
  const [creatingTeam, setCreatingTeam] = useState(false)

  const [memberForms, setMemberForms] = useState<Record<string, { userId: string; role: string; query: string; open: boolean }>>({})
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const comboRefs = useRef<Record<string, HTMLDivElement | null>>({})

  async function load() {
    const data = await fetch('/api/teams').then((r) => r.json())
    setTeams(data)
    setLoading(false)
  }

  async function loadUsers() {
    const data = await fetch('/api/users').then((r) => r.json())
    if (Array.isArray(data)) setAllUsers(data)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (!isReadOnly) loadUsers() }, [isReadOnly])

  async function createTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!teamName.trim()) return
    setCreatingTeam(true)
    await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamName, color: teamColor }),
    })
    setTeamName('')
    setTeamColor(COLORS[0])
    setCreatingTeam(false)
    load()
  }

  async function deleteTeam(id: string) {
    if (!confirm(t.deleteTeamConfirm)) return
    await fetch(`/api/teams/${id}`, { method: 'DELETE' })
    load()
  }

  async function addMember(teamId: string) {
    const form = memberForms[teamId]
    if (!form?.userId) return
    const user = allUsers.find((u) => u.id === form.userId)
    if (!user) return
    await fetch(`/api/teams/${teamId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username, role: form.role }),
    })
    setMemberForms((prev) => ({ ...prev, [teamId]: { userId: '', role: '', query: '', open: false } }))
    load()
  }

  function userLabel(u: UserOption) {
    return u.display_name ? `${u.display_name} (${u.username})` : u.username
  }

  async function removeMember(teamId: string, userId: string) {
    await fetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' })
    load()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">{t.loading}</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm flex-shrink-0">{t.back}</Link>
            <span className="text-gray-300 flex-shrink-0">|</span>
            <span className="text-xl sm:text-2xl flex-shrink-0">👥</span>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">{t.teamManagement}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="flex items-center gap-0.5 sm:gap-1 text-xs">
              {LOCALES.map((l) => (
                <button key={l.value} onClick={() => setLocale(l.value as Locale)}
                  className={`px-1.5 sm:px-2 py-0.5 rounded transition-colors ${locale === l.value ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-700'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <button
              onClick={toggleDark}
              className="no-invert text-lg leading-none opacity-60 hover:opacity-100 transition-opacity"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            {session && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-gray-200">
                <Link href="/profile" className="hidden sm:block text-xs text-gray-500 hover:text-blue-600 transition-colors">{session.displayName ?? session.user}</Link>
                {session.permission === 'readonly' && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">読取</span>
                )}
                <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">ログアウト</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Add team form */}
        {!isReadOnly && <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">{t.addNewTeam}</h2>
          <form onSubmit={createTeam}>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs text-gray-500 block mb-1">{t.teamNameLabel}</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder={t.teamNamePlaceholder}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t.color}</label>
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTeamColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        teamColor === c ? 'border-gray-800 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={creatingTeam}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creatingTeam ? t.adding : `+ ${t.add}`}
              </button>
            </div>
          </form>
        </div>}

        {/* Team list */}
        {teams.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">👥</div>
            <p className="text-lg font-medium">{t.noTeams}</p>
            <p className="text-sm mt-1">{t.noTeamsHint}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map((team) => {
              const isExpanded = expandedTeam === team.id
              const mf = memberForms[team.id] ?? { userId: '', role: '', query: '', open: false }
              const existingUserIds = new Set(team.members.map((m) => m.id))
              const availableUsers = allUsers.filter((u) => !existingUserIds.has(u.id))
              const filteredUsers = mf.query
                ? availableUsers.filter((u) =>
                    userLabel(u).toLowerCase().includes(mf.query.toLowerCase()) ||
                    u.email?.toLowerCase().includes(mf.query.toLowerCase())
                  )
                : availableUsers

              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  {/* Team header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-xl"
                    onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                  >
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                    <div className="flex-1">
                      <span className="font-semibold text-gray-900">{team.name}</span>
                      <span className="ml-2 text-sm text-gray-400">{t.membersCount(team.members.length)}</span>
                    </div>
                    {!isReadOnly && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteTeam(team.id) }}
                        className="text-gray-300 hover:text-red-400 text-sm transition-colors mr-2"
                      >
                        {t.delete}
                      </button>
                    )}
                    <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4">
                      {/* Members */}
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">{t.membersLabel}</h3>
                        {team.members.length === 0 ? (
                          <p className="text-sm text-gray-400">{t.noMembers}</p>
                        ) : (
                          <div className="space-y-2">
                            {team.members.map((m) => (
                              <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <div>
                                  <span className="text-sm font-medium text-gray-800">{m.name}</span>
                                  {m.role && <span className="ml-2 text-xs text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded">{m.role}</span>}
                                  <div className="text-xs text-gray-400 mt-0.5">{m.email}</div>
                                </div>
                                {!isReadOnly && (
                                  <button
                                    onClick={() => removeMember(team.id, m.id)}
                                    className="text-gray-300 hover:text-red-400 text-sm transition-colors"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add member form */}
                      {!isReadOnly && <div className="border-t border-gray-100 pt-4">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">{t.addMemberLabel}</h3>
                        {availableUsers.length === 0 ? (
                          <p className="text-sm text-gray-400">{t.noAvailableUsers}</p>
                        ) : (
                          <div className="flex flex-wrap gap-2 items-start">
                            {/* Combobox */}
                            <div
                              className="relative flex-1 min-w-[180px]"
                              ref={(el) => { comboRefs.current[team.id] = el }}
                            >
                              <div className={`flex items-center border rounded-lg overflow-hidden ${mf.open ? 'ring-2 ring-blue-400 border-blue-400' : 'border-blue-200'}`}>
                                <input
                                  className="flex-1 px-3 py-1.5 text-sm text-black focus:outline-none bg-white"
                                  placeholder={t.selectUserPlaceholder}
                                  value={mf.userId ? userLabel(allUsers.find((u) => u.id === mf.userId)!) : mf.query}
                                  onFocus={() => setMemberForms((prev) => ({ ...prev, [team.id]: { ...mf, open: true } }))}
                                  onChange={(e) => setMemberForms((prev) => ({
                                    ...prev, [team.id]: { ...mf, query: e.target.value, userId: '', open: true }
                                  }))}
                                  onBlur={() => setTimeout(() => setMemberForms((prev) => {
                                    const cur = prev[team.id] ?? mf
                                    return { ...prev, [team.id]: { ...cur, open: false, query: cur.userId ? '' : cur.query } }
                                  }), 150)}
                                />
                                {mf.userId && (
                                  <button
                                    type="button"
                                    onClick={() => setMemberForms((prev) => ({ ...prev, [team.id]: { ...mf, userId: '', query: '', open: false } }))}
                                    className="px-2 text-gray-400 hover:text-gray-600"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              {mf.open && (
                                <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                  {filteredUsers.length === 0 ? (
                                    <li className="px-3 py-2 text-sm text-gray-400">{t.noAvailableUsers}</li>
                                  ) : filteredUsers.map((u) => (
                                    <li
                                      key={u.id}
                                      onMouseDown={() => setMemberForms((prev) => ({
                                        ...prev, [team.id]: { ...mf, userId: u.id, query: '', open: false }
                                      }))}
                                      className="px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 cursor-pointer"
                                    >
                                      <span className="font-medium">{u.display_name ?? u.username}</span>
                                      {u.display_name && <span className="ml-1 text-gray-400 text-xs">({u.username})</span>}
                                      {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <input
                              className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder={t.rolePlaceholder}
                              value={mf.role}
                              onChange={(e) => setMemberForms((prev) => ({
                                ...prev, [team.id]: { ...mf, role: e.target.value }
                              }))}
                            />
                            <button
                              onClick={() => addMember(team.id)}
                              disabled={!mf.userId}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors"
                            >
                              {t.add}
                            </button>
                          </div>
                        )}
                      </div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

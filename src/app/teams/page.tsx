'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Team, Member } from '@/lib/types'
import { useDarkMode } from '@/components/DarkModeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { LOCALES, type Locale } from '@/lib/i18n'

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

export default function TeamsPage() {
  const { isDark, toggle: toggleDark } = useDarkMode()
  const { t, locale, setLocale } = useLanguage()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  const [teamName, setTeamName] = useState('')
  const [teamColor, setTeamColor] = useState(COLORS[0])
  const [creatingTeam, setCreatingTeam] = useState(false)

  const [memberForms, setMemberForms] = useState<Record<string, { name: string; email: string; role: string }>>({})
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)

  async function load() {
    const data = await fetch('/api/teams').then((r) => r.json())
    setTeams(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
    if (!form?.name || !form?.email) return
    await fetch(`/api/teams/${teamId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setMemberForms((prev) => ({ ...prev, [teamId]: { name: '', email: '', role: '' } }))
    load()
  }

  async function removeMember(teamId: string, memberId: string) {
    const team = teams.find((tm) => tm.id === teamId)
    if (!team) return
    const members = team.members.filter((m: Member) => m.id !== memberId)
    await fetch(`/api/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members }),
    })
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
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">{t.back}</Link>
            <span className="text-gray-300">|</span>
            <span className="text-2xl">👥</span>
            <h1 className="text-lg font-bold text-gray-900">{t.teamManagement}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs">
              {LOCALES.map((l) => (
                <button key={l.value} onClick={() => setLocale(l.value as Locale)}
                  className={`px-2 py-0.5 rounded transition-colors ${locale === l.value ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-400 hover:text-gray-700'}`}>
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
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Add team form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
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
        </div>

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
              const mf = memberForms[team.id] ?? { name: '', email: '', role: '' }

              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Team header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                  >
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                    <div className="flex-1">
                      <span className="font-semibold text-gray-900">{team.name}</span>
                      <span className="ml-2 text-sm text-gray-400">{t.membersCount(team.members.length)}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTeam(team.id) }}
                      className="text-gray-300 hover:text-red-400 text-sm transition-colors mr-2"
                    >
                      {t.delete}
                    </button>
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
                            {team.members.map((m: Member) => (
                              <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <div>
                                  <span className="text-sm font-medium text-gray-800">{m.name}</span>
                                  {m.role && <span className="ml-2 text-xs text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded">{m.role}</span>}
                                  <div className="text-xs text-gray-400 mt-0.5">{m.email}</div>
                                </div>
                                <button
                                  onClick={() => removeMember(team.id, m.id)}
                                  className="text-gray-300 hover:text-red-400 text-sm transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add member form */}
                      <div className="border-t border-gray-100 pt-4">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">{t.addMemberLabel}</h3>
                        <div className="flex flex-wrap gap-2">
                          <input
                            className="flex-1 min-w-[120px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder={t.namePlaceholder}
                            value={mf.name}
                            onChange={(e) => setMemberForms((prev) => ({
                              ...prev, [team.id]: { ...mf, name: e.target.value }
                            }))}
                          />
                          <input
                            className="flex-1 min-w-[160px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder={t.emailPlaceholder}
                            type="email"
                            value={mf.email}
                            onChange={(e) => setMemberForms((prev) => ({
                              ...prev, [team.id]: { ...mf, email: e.target.value }
                            }))}
                          />
                          <input
                            className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder={t.rolePlaceholder}
                            value={mf.role}
                            onChange={(e) => setMemberForms((prev) => ({
                              ...prev, [team.id]: { ...mf, role: e.target.value }
                            }))}
                          />
                          <button
                            onClick={() => addMember(team.id)}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                          >
                            {t.add}
                          </button>
                        </div>
                      </div>
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

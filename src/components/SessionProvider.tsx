'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

type Role = 'admin' | 'user' | 'readonly'
interface SessionState { user: string; role: Role }

const SessionContext = createContext<{
  session: SessionState | null
  loading: boolean
  logout: () => Promise<void>
}>({ session: null, loading: true, logout: async () => {} })

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setSession(data ? { user: data.user, role: data.role } : null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}

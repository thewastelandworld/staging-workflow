'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const DarkModeContext = createContext<{ isDark: boolean; toggle: () => void }>({
  isDark: false,
  toggle: () => {},
})

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('dark-mode') === 'true'
    setIsDark(stored)
    document.documentElement.classList.toggle('dark-mode', stored)
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('dark-mode', String(next))
    document.documentElement.classList.toggle('dark-mode', next)
  }

  return (
    <DarkModeContext.Provider value={{ isDark, toggle }}>
      {children}
    </DarkModeContext.Provider>
  )
}

export function useDarkMode() {
  return useContext(DarkModeContext)
}

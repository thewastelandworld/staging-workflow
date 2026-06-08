'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { translations, LOCALES, type Locale, type Translations } from '@/lib/i18n'

interface LanguageContextValue {
  locale: Locale
  t: Translations
  setLocale: (l: Locale) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'ja',
  t: translations.ja,
  setLocale: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ja')

  useEffect(() => {
    const stored = localStorage.getItem('locale') as Locale | null
    if (stored && LOCALES.some((l) => l.value === stored)) {
      setLocaleState(stored)
    }
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('locale', l)
  }

  return (
    <LanguageContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

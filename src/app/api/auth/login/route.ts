import { cookies } from 'next/headers'
import { signSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { verifyPassword } from '@/lib/password'
import type { Role } from '@/lib/session'

export async function POST(req: Request) {
  const { username, password } = await req.json()

  let role: Role | null = null

  // Check Supabase users table first
  try {
    const supabase = getSupabase()
    const { data: user } = await supabase
      .from('users')
      .select('password_hash, role')
      .eq('username', username)
      .single()

    if (user) {
      const valid = await verifyPassword(password, user.password_hash)
      if (valid) role = user.role as Role
    }
  } catch {
    // Supabase unavailable — fall through to hardcoded credentials
  }

  // Hardcoded fallback credentials
  if (!role) {
    const adminUser = process.env.AUTH_ADMIN_USER ?? 'admin'
    const adminPass = process.env.AUTH_ADMIN_PASS ?? 'admin'
    if (username === adminUser && password === adminPass) {
      role = 'admin'
    } else if (username === 'demo' && password === 'demo') {
      role = 'readonly'
    }
  }

  if (!role) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await signSession({
    user: username,
    role,
    exp: Date.now() + 10 * 60 * 1000,
  })

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })

  return Response.json({ ok: true, role })
}

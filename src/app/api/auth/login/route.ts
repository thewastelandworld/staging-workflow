import { cookies } from 'next/headers'
import { signSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { verifyPassword } from '@/lib/password'
import type { Permission } from '@/lib/session'

export async function POST(req: Request) {
  const { username, password } = await req.json()

  let permission: Permission | null = null

  // Check Supabase users table first
  try {
    const supabase = getSupabase()
    const { data: user } = await supabase
      .from('users')
      .select('password_hash, permission, status')
      .eq('username', username)
      .single()

    if (user) {
      const valid = await verifyPassword(password, user.password_hash)
      if (valid) {
        if (user.status === 'pending') {
          return Response.json({ error: '管理者の承認をお待ちください', pending: true }, { status: 403 })
        }
        permission = user.permission as Permission
      }
    }
  } catch {
    // Supabase unavailable — fall through to hardcoded credentials
  }

  // Hardcoded fallback credentials
  if (!permission) {
    const adminUser = process.env.AUTH_ADMIN_USER ?? 'admin'
    const adminPass = process.env.AUTH_ADMIN_PASS ?? 'admin'
    if (username === adminUser && password === adminPass) {
      permission = 'admin'
    } else if (username === 'demo' && password === 'demo') {
      permission = 'user'
    }
  }

  if (!permission) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await signSession({
    user: username,
    permission,
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

  return Response.json({ ok: true, permission })
}

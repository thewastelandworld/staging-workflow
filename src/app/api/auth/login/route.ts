import { cookies } from 'next/headers'
import { signSession } from '@/lib/session'

export async function POST(req: Request) {
  const { username, password } = await req.json()

  const adminUser = process.env.AUTH_ADMIN_USER ?? 'admin'
  const adminPass = process.env.AUTH_ADMIN_PASS ?? 'admin'

  let role: 'admin' | 'readonly' | null = null
  if (username === adminUser && password === adminPass) {
    role = 'admin'
  } else if (username === 'demo' && password === 'demo') {
    role = 'readonly'
  }

  if (!role) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await signSession({
    user: username,
    role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  return Response.json({ ok: true, role })
}

import { NextRequest, NextResponse } from 'next/server'
import { verifySession, signSession } from '@/lib/session'

const SESSION_DURATION_MS = 10 * 60 * 1000
const SESSION_DURATION_S = 10 * 60

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  const token = req.cookies.get('session')?.value

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  const session = await verifySession(token)
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  const newToken = await signSession({ ...session, exp: Date.now() + SESSION_DURATION_MS })
  const response = NextResponse.next()
  response.cookies.set('session', newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_S,
  })
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}

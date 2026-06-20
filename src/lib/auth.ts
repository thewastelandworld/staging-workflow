import 'server-only'
import { cookies } from 'next/headers'
import { verifySession } from './session'
import type { Session } from './session'

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function assertWritable(): Promise<Response | null> {
  const session = await getSession()
  if (!session || session.permission === 'readonly') {
    return Response.json({ error: 'Read-only access' }, { status: 403 })
  }
  return null
}

import 'server-only'
import { cookies } from 'next/headers'
import { verifySession } from './session'
import type { Session } from './session'

// Cookie からセッションを取得して検証する。未ログインまたはトークン無効なら null
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null
  return verifySession(token)
}

// 書き込み権限がない場合に 403 レスポンスを返す。API ルートのガードに使う
// 呼び出し元は `const deny = await assertWritable(); if (deny) return deny;` のパターンで使う
export async function assertWritable(): Promise<Response | null> {
  const session = await getSession()
  if (!session || session.permission === 'readonly') {
    return Response.json({ error: 'Read-only access' }, { status: 403 })
  }
  return null
}

// 管理者権限がない場合に 403 を返す。ユーザー管理などの管理者専用 API に使う
export async function assertAdmin(): Promise<Response | null> {
  const session = await getSession()
  if (!session || session.permission !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 })
  }
  return null
}

import { getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { revalidateTag } from 'next/cache'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let displayName: string | null = null
  let email: string | null = null
  try {
    const { data } = await getSupabase()
      .from('users')
      .select('display_name, email')
      .eq('username', session.user)
      .maybeSingle()
    if (data) {
      displayName = data.display_name ?? null
      email = data.email ?? null
    }
  } catch {
    // hardcoded users (admin/demo) don't exist in DB
  }

  return Response.json({ user: session.user, permission: session.permission, displayName, email })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { displayName, email } = await req.json()

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return Response.json({ error: 'メールアドレスを入力してください' }, { status: 400 })
  }

  const { error: updateError } = await getSupabase()
    .from('users')
    .update({
      display_name: (typeof displayName === 'string' && displayName.trim()) ? displayName.trim() : null,
      email: email.trim(),
    })
    .eq('username', session.user)

  if (updateError) {
    return Response.json({ error: 'プロフィールの更新に失敗しました' }, { status: 500 })
  }

  revalidateTag('teams', { expire: 0 })
  return Response.json({ ok: true })
}

import { getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'

// GET /api/admin/users — 全ユーザー一覧を返す（admin 専用）
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.permission !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('users')
      .select('id, username, permission, display_name, email, status')
      .order('username', { ascending: true })

    if (error) {
      console.error('[admin/users] DB error:', error.code, error.message, error.details, error.hint)
      return Response.json({ error: 'DB error', detail: error.message }, { status: 500 })
    }

    return Response.json(data ?? [])
  } catch (err) {
    console.error('[admin/users] Unhandled error:', err)
    return Response.json({ error: 'Internal error', detail: String(err) }, { status: 500 })
  }
}

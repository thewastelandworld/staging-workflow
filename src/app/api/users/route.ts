import { getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await getSupabase()
    .from('users')
    .select('id, username, display_name, email')
    .order('username', { ascending: true })

  if (error) {
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  return Response.json(data ?? [])
}

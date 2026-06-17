import { getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('users')
    .select('id, username, role')
    .order('username', { ascending: true })

  if (error) {
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  return Response.json(data ?? [])
}

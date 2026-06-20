import { getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.permission !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { permission } = await req.json()
  if (permission !== 'user' && permission !== 'readonly') {
    return Response.json({ error: 'Invalid permission' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { data: target } = await supabase
    .from('users')
    .select('username')
    .eq('id', id)
    .single()

  if (target?.username === session.user) {
    return Response.json({ error: '自分の権限は変更できません' }, { status: 400 })
  }

  const { error } = await supabase.from('users').update({ permission }).eq('id', id)
  if (error) {
    const msg = process.env.NODE_ENV === 'development' ? error.message : 'DB error'
    return Response.json({ error: msg }, { status: 500 })
  }

  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.permission !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const supabase = getSupabase()

  const { data: target } = await supabase
    .from('users')
    .select('username')
    .eq('id', id)
    .single()

  if (target?.username === session.user) {
    return Response.json({ error: '自分のアカウントは削除できません' }, { status: 400 })
  }

  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) {
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}

import { getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { revalidateTag } from 'next/cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.permission !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  const supabase = getSupabase()
  const { data: target } = await supabase.from('users').select('username').eq('id', id).single()

  if (target?.username === session.user) {
    return Response.json({ error: '自分の権限は変更できません' }, { status: 400 })
  }

  // Approve pending user
  if (body.approve === true) {
    const { error } = await supabase.from('users').update({ status: 'approved' }).eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  // Change permission
  const { permission } = body
  if (permission !== 'user' && permission !== 'readonly' && permission !== 'team_leader') {
    return Response.json({ error: 'Invalid permission' }, { status: 400 })
  }
  const { error } = await supabase.from('users').update({ permission }).eq('id', id)
  if (error) {
    return Response.json({ error: process.env.NODE_ENV === 'development' ? error.message : 'DB error' }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
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

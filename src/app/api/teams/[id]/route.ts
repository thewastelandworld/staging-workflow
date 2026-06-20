import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { toTeam } from '@/lib/mappers'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { assertWritable } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

const MEMBER_SELECT = 'user_teams(role, users(id, username, display_name, email))'

export async function PATCH(req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id } = await params
  const body = await req.json()
  const { data, error } = await getSupabase()
    .from('teams')
    .update({ name: body.name, color: body.color })
    .eq('id', id)
    .select(`*, ${MEMBER_SELECT}`)
    .single()
  if (error || !data) {
    log.error('Failed to update team', { id, error: error?.message })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Team updated', { id, name: body.name })
  return NextResponse.json(toTeam(data))
}

export async function DELETE(_req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id } = await params
  // user_teams entries are removed automatically via ON DELETE CASCADE
  const { error } = await getSupabase().from('teams').delete().eq('id', id)
  if (error) {
    log.error('Failed to delete team', { id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Team deleted', { id })
  return NextResponse.json({ ok: true })
}

// Add a member to a team by username
export async function POST(req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id } = await params
  const body = await req.json()

  const { data: teamRow } = await getSupabase()
    .from('teams')
    .select('id')
    .eq('id', id)
    .single()
  if (!teamRow) {
    log.warn('Team not found when adding member', { teamId: id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: user } = await getSupabase()
    .from('users')
    .select('id, username, display_name, email')
    .eq('username', body.username as string)
    .maybeSingle()
  if (!user) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  }

  const { error } = await getSupabase()
    .from('user_teams')
    .insert({ user_id: user.id, team_id: id, role: (body.role as string) || null })
  if (error) {
    log.error('Failed to add member', { teamId: id, username: body.username, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateTag('teams', { expire: 0 })
  log.info('Member added', { teamId: id, username: user.username })
  return NextResponse.json({
    id: user.id,
    username: user.username,
    name: user.display_name ?? user.username,
    email: user.email ?? '',
    role: (body.role as string) || undefined,
  }, { status: 201 })
}

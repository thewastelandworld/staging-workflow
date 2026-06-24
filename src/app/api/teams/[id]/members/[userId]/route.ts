import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { getSession } from '@/lib/auth'

type Params = { params: Promise<{ id: string; userId: string }> }

async function getCallerTeamIds(username: string): Promise<string[]> {
  const { data: user } = await getSupabase().from('users').select('id').eq('username', username).maybeSingle()
  if (!user) return []
  const { data: ut } = await getSupabase().from('user_teams').select('team_id').eq('user_id', user.id)
  return (ut ?? []).map((r) => r.team_id as string)
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession()
  if (!session || session.permission === 'readonly') {
    return NextResponse.json({ error: 'Read-only access' }, { status: 403 })
  }

  const { id, userId } = await params

  if (session.permission !== 'admin') {
    if (session.permission !== 'team_leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const teamIds = await getCallerTeamIds(session.user)
    if (!teamIds.includes(id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json()
  const role = typeof body.role === 'string' ? body.role.trim() : null

  const { error } = await getSupabase()
    .from('user_teams')
    .update({ role: role || null })
    .eq('team_id', id)
    .eq('user_id', userId)
  if (error) {
    log.error('Failed to update member role', { teamId: id, userId, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Member role updated', { teamId: id, userId, role })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session || session.permission === 'readonly') {
    return NextResponse.json({ error: 'Read-only access' }, { status: 403 })
  }

  const { id, userId } = await params

  if (session.permission !== 'admin') {
    if (session.permission !== 'team_leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const teamIds = await getCallerTeamIds(session.user)
    if (!teamIds.includes(id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { error } = await getSupabase()
    .from('user_teams')
    .delete()
    .eq('team_id', id)
    .eq('user_id', userId)
  if (error) {
    log.error('Failed to remove member', { teamId: id, userId, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Member removed', { teamId: id, userId })
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import type { Member } from '@/lib/types'
import { toTeam } from '@/lib/mappers'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'

type Params = { params: Promise<{ id: string }> }

async function getTeamRow(id: string) {
  const { data, error } = await getSupabase()
    .from('teams')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const { data, error } = await getSupabase()
    .from('teams')
    .update(body.members !== undefined
      ? { members: body.members }
      : { name: body.name, color: body.color })
    .eq('id', id)
    .select()
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
  const { id } = await params
  const { error } = await getSupabase().from('teams').delete().eq('id', id)
  if (error) {
    log.error('Failed to delete team', { id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Team deleted', { id })
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()

  const row = await getTeamRow(id)
  if (!row) {
    log.warn('Team not found when adding member', { teamId: id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const member: Member = {
    id: uuid(),
    name: body.name as string,
    email: body.email as string,
    role: (body.role as string) ?? '',
  }
  const members: Member[] = [...((row.members as Member[]) ?? []), member]

  const { error } = await getSupabase()
    .from('teams')
    .update({ members })
    .eq('id', id)
  if (error) {
    log.error('Failed to add member', { teamId: id, memberName: member.name, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Member added', { teamId: id, memberId: member.id, name: member.name })
  return NextResponse.json(member, { status: 201 })
}

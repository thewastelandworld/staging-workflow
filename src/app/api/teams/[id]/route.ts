import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import type { Team, Member } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

function toTeam(row: Record<string, unknown>): Team {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: row.created_at as string,
    members: (row.members as Team['members']) ?? [],
  }
}

async function getTeamRow(id: string) {
  const { data, error } = await getSupabase()
    .from('teams')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

// Update team fields (name, color) or replace members array
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
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(toTeam(data))
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const { error } = await getSupabase().from('teams').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Add member to team
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()

  const row = await getTeamRow(id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(member, { status: 201 })
}

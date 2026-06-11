import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { toTeam } from '@/lib/mappers'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'

async function fetchTeams() {
  'use cache'
  cacheLife('hours')
  cacheTag('teams')
  const { data, error } = await getSupabase()
    .from('teams')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toTeam)
}

export async function GET() {
  try {
    return NextResponse.json(await fetchTeams())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { data: existing } = await getSupabase().from('teams').select('id')
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

  const team = {
    id: uuid(),
    name: body.name as string,
    color: (body.color as string) ?? COLORS[(existing?.length ?? 0) % COLORS.length],
    created_at: new Date().toISOString(),
    members: [],
  }
  const { error } = await getSupabase().from('teams').insert(team)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidateTag('teams', { expire: 0 })
  return NextResponse.json(toTeam(team), { status: 201 })
}

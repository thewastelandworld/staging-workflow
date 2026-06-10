import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { toProject } from '@/lib/mappers'

export async function GET() {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(toProject))
}

export async function POST(req: Request) {
  const body = await req.json()
  const project = {
    id: uuid(),
    name: body.name as string,
    description: (body.description as string) ?? '',
    created_at: new Date().toISOString(),
    stages: [],
  }
  const { error } = await getSupabase().from('projects').insert(project)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toProject(project), { status: 201 })
}

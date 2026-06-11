import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { toProject } from '@/lib/mappers'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'

async function fetchProjects() {
  'use cache'
  cacheLife('minutes')
  cacheTag('projects')
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toProject)
}

export async function GET() {
  try {
    return NextResponse.json(await fetchProjects())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
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
  revalidateTag('projects', { expire: 0 })
  return NextResponse.json(toProject(project), { status: 201 })
}

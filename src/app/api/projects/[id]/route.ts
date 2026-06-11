import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { toProject } from '@/lib/mappers'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'

async function fetchProject(id: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag('projects', `project-${id}`)
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await fetchProject(id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(toProject(row))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { data, error } = await getSupabase()
    .from('projects')
    .update({ name: body.name, description: body.description })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  return NextResponse.json(toProject(data))
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await getSupabase().from('projects').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  return NextResponse.json({ ok: true })
}

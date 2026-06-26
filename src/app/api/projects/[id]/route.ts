import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { toProject } from '@/lib/mappers'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { assertWritable } from '@/lib/auth'

// 特定プロジェクトをステージ・レビュアー付きで取得する。プロジェクト単位でタグ管理する
async function fetchProject(id: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag('projects', `project-${id}`)
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*, stages(*, stage_reviewers(*))')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

// GET /api/projects/[id] — プロジェクト詳細を返す
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await fetchProject(id)
  if (!row) {
    log.warn('Project not found', { id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(toProject(row))
}

// PATCH /api/projects/[id] — プロジェクト名・説明を更新する
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id } = await params
  const body = await req.json()
  const { data, error } = await getSupabase()
    .from('projects')
    .update({ name: body.name, description: body.description })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    log.error('Failed to update project', { id, error: error?.message })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  log.info('Project updated', { id, name: body.name })
  return NextResponse.json(toProject(data))
}

// DELETE /api/projects/[id] — プロジェクトを削除する（ステージはカスケード削除）
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id } = await params
  const { error } = await getSupabase().from('projects').delete().eq('id', id)
  if (error) {
    log.error('Failed to delete project', { id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  log.info('Project deleted', { id })
  return NextResponse.json({ ok: true })
}

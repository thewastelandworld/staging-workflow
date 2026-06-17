import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import type { Stage } from '@/lib/types'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { assertWritable } from '@/lib/auth'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id } = await params
  const body = await req.json()

  const { data: row, error: fetchErr } = await getSupabase()
    .from('projects')
    .select('stages')
    .eq('id', id)
    .single()
  if (fetchErr || !row) {
    log.warn('Project not found when adding stage', { projectId: id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const stage: Stage = {
    id: uuid(),
    projectId: id,
    order: body.order ?? ((row.stages as Stage[]).length + 1),
    name: body.name,
    description: body.description ?? '',
    teamId: body.teamId,
    deadline: body.deadline,
    status: 'pending',
    emailSent: false,
    reviewers: (body.reviewers ?? []),
  }

  const stages: Stage[] = [...(row.stages as Stage[]), stage].sort((a, b) => a.order - b.order)

  const { error: updateErr } = await getSupabase()
    .from('projects')
    .update({ stages })
    .eq('id', id)
  if (updateErr) {
    log.error('Failed to add stage', { projectId: id, stageName: stage.name, error: updateErr.message })
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  log.info('Stage added', { projectId: id, stageId: stage.id, name: stage.name, order: stage.order })
  return NextResponse.json(stage, { status: 201 })
}

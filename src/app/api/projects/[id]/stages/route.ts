import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import type { Stage, StageReviewer } from '@/lib/types'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { assertWritable } from '@/lib/auth'

// POST /api/projects/[id]/stages — プロジェクトに新規ステージを追加する
// body.order が省略された場合は既存ステージ数 + 1 を自動付与する
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id } = await params
  const body = await req.json()

  const { data: project, error: projectErr } = await getSupabase()
    .from('projects')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (projectErr || !project) {
    log.warn('Project not found when adding stage', { projectId: id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { count } = await getSupabase()
    .from('stages')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', id)

  const stageRow = {
    id: uuid(),
    project_id: id,
    order: body.order ?? ((count ?? 0) + 1),
    name: body.name as string,
    description: (body.description as string) ?? '',
    team_id: body.teamId as string,
    deadline: body.deadline as string,
    status: 'pending',
    email_sent: false,
  }

  const { error: insertErr } = await getSupabase().from('stages').insert(stageRow)
  if (insertErr) {
    log.error('Failed to add stage', { projectId: id, stageName: stageRow.name, error: insertErr.message })
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const reviewers: StageReviewer[] = body.reviewers ?? []
  if (reviewers.length > 0) {
    const reviewerRows = reviewers.map((r: StageReviewer) => ({
      stage_id: stageRow.id,
      team_id: r.teamId,
      order: r.order,
      check_content: r.checkContent ?? null,
    }))
    const { error: reviewerErr } = await getSupabase().from('stage_reviewers').insert(reviewerRows)
    if (reviewerErr) {
      log.error('Failed to add stage reviewers', { projectId: id, stageId: stageRow.id, error: reviewerErr.message })
    }
  }

  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })

  const stage: Stage = {
    id: stageRow.id,
    projectId: id,
    order: stageRow.order,
    name: stageRow.name,
    description: stageRow.description,
    teamId: stageRow.team_id,
    deadline: stageRow.deadline,
    status: 'pending',
    emailSent: false,
    reviewers,
  }
  log.info('Stage added', { projectId: id, stageId: stage.id, name: stage.name, order: stage.order })
  return NextResponse.json(stage, { status: 201 })
}
